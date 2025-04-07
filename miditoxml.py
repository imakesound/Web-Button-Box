#!/usr/bin/env python3
"""
Simple MuseScore Converter - Downloads from MuseScore and converts to MusicXML
"""
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import os
import sys
import subprocess
import tempfile
import threading
import time

# Check if music21 is installed
try:
    from music21 import converter
    MUSIC21_INSTALLED = True
except ImportError:
    MUSIC21_INSTALLED = False

class SimpleConverter(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Simple MuseScore Converter")
        self.geometry("500x300")
        
        # Main frame
        main_frame = tk.Frame(self, padx=15, pady=15)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Input fields
        url_frame = tk.Frame(main_frame)
        url_frame.pack(fill=tk.X, pady=5)
        
        tk.Label(url_frame, text="MuseScore URL:").pack(side=tk.LEFT)
        self.url_entry = tk.Entry(url_frame)
        self.url_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # Output folder
        output_frame = tk.Frame(main_frame)
        output_frame.pack(fill=tk.X, pady=5)
        
        tk.Label(output_frame, text="Save to:").pack(side=tk.LEFT)
        self.output_var = tk.StringVar(value=os.path.join(os.path.expanduser('~'), "MusicXML"))
        self.output_entry = tk.Entry(output_frame, textvariable=self.output_var)
        self.output_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        tk.Button(output_frame, text="Browse", command=self.browse_output).pack(side=tk.RIGHT)
        
        # Format selection
        format_frame = tk.Frame(main_frame)
        format_frame.pack(fill=tk.X, pady=10)
        
        tk.Label(format_frame, text="Format:").pack(side=tk.LEFT)
        
        self.format_var = tk.StringVar(value="musicxml")
        formats = [
            ("MusicXML", "musicxml"),
            ("MIDI", "midi"),
            ("MP3", "mp3"),
            ("PDF", "pdf")
        ]
        
        for text, value in formats:
            tk.Radiobutton(format_frame, text=text, variable=self.format_var, value=value).pack(side=tk.LEFT, padx=5)
        
        # Progress and status
        self.status_var = tk.StringVar(value="Ready")
        self.status_label = tk.Label(main_frame, textvariable=self.status_var, anchor="w", justify=tk.LEFT)
        self.status_label.pack(fill=tk.X, pady=5)
        
        self.progress = ttk.Progressbar(main_frame, mode="indeterminate")
        self.progress.pack(fill=tk.X, pady=5)
        
        # Buttons
        button_frame = tk.Frame(main_frame)
        button_frame.pack(fill=tk.X, pady=10)
        
        self.convert_button = tk.Button(button_frame, text="Download & Convert", command=self.start_conversion)
        self.convert_button.pack(side=tk.LEFT, padx=5)
        
        self.open_folder_button = tk.Button(button_frame, text="Open Output Folder", command=self.open_output_folder)
        self.open_folder_button.pack(side=tk.LEFT, padx=5)
        
        self.file_list_button = tk.Button(button_frame, text="List Downloaded Files", command=self.show_downloaded_files)
        self.file_list_button.pack(side=tk.LEFT, padx=5)
        
    def browse_output(self):
        folder_path = filedialog.askdirectory(title="Select Output Folder")
        if folder_path:
            self.output_var.set(folder_path)
            
    def open_output_folder(self):
        folder_path = self.output_var.get()
        if not os.path.exists(folder_path):
            try:
                os.makedirs(folder_path)
            except Exception as e:
                messagebox.showerror("Error", f"Could not create folder: {str(e)}")
                return
                
        # Open folder in file explorer
        try:
            if sys.platform == 'win32':
                os.startfile(folder_path)
            elif sys.platform == 'darwin':  # macOS
                subprocess.run(['open', folder_path])
            else:  # Linux
                subprocess.run(['xdg-open', folder_path])
        except Exception as e:
            messagebox.showerror("Error", f"Could not open folder: {str(e)}")
            
    def show_downloaded_files(self):
        folder_path = self.output_var.get()
        if not os.path.exists(folder_path):
            messagebox.showinfo("Info", "Output folder does not exist yet.")
            return
            
        # Get all files in the folder
        files = []
        for file in os.listdir(folder_path):
            file_path = os.path.join(folder_path, file)
            if os.path.isfile(file_path):
                size = os.path.getsize(file_path)
                mtime = os.path.getmtime(file_path)
                files.append((file, size, mtime, file_path))
                
        if not files:
            messagebox.showinfo("Info", "No files found in the output folder.")
            return
            
        # Sort by modification time (newest first)
        files.sort(key=lambda x: x[2], reverse=True)
        
        # Create a dialog to show files
        file_dialog = tk.Toplevel(self)
        file_dialog.title("Downloaded Files")
        file_dialog.geometry("500x300")
        
        # Create a listbox with scrollbar
        frame = tk.Frame(file_dialog)
        frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        scrollbar = tk.Scrollbar(frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        listbox = tk.Listbox(frame, yscrollcommand=scrollbar.set, font=("TkDefaultFont", 10))
        listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        scrollbar.config(command=listbox.yview)
        
        # Add files to listbox
        for i, (file, size, mtime, _) in enumerate(files):
            size_str = f"{size / 1024:.1f} KB" if size < 1024*1024 else f"{size / (1024*1024):.1f} MB"
            time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mtime))
            listbox.insert(tk.END, f"{file} ({size_str}, {time_str})")
            
        # Button to open selected file
        def open_selected_file():
            selection = listbox.curselection()
            if selection:
                file_path = files[selection[0]][3]
                try:
                    if sys.platform == 'win32':
                        os.startfile(file_path)
                    elif sys.platform == 'darwin':  # macOS
                        subprocess.run(['open', file_path])
                    else:  # Linux
                        subprocess.run(['xdg-open', file_path])
                except Exception as e:
                    messagebox.showerror("Error", f"Could not open file: {str(e)}")
        
        button_frame = tk.Frame(file_dialog)
        button_frame.pack(fill=tk.X, pady=5)
        
        tk.Button(button_frame, text="Open Selected File", command=open_selected_file).pack(side=tk.LEFT, padx=5)
        tk.Button(button_frame, text="Close", command=file_dialog.destroy).pack(side=tk.RIGHT, padx=5)
        
    def start_conversion(self):
        url = self.url_entry.get().strip()
        output_folder = self.output_var.get().strip()
        
        if not url:
            messagebox.showerror("Error", "Please enter a MuseScore URL")
            return
            
        if not url.startswith(("http://", "https://")):
            messagebox.showerror("Error", "URL must start with http:// or https://")
            return
            
        if "musescore.com" not in url:
            messagebox.showerror("Error", "URL must be from musescore.com")
            return
            
        # Create output folder if it doesn't exist
        try:
            os.makedirs(output_folder, exist_ok=True)
        except Exception as e:
            messagebox.showerror("Error", f"Could not create output folder: {str(e)}")
            return
            
        # Disable UI during conversion
        self.convert_button.config(state=tk.DISABLED)
        self.progress.start()
        
        # Start conversion in a separate thread
        thread = threading.Thread(target=self.do_conversion, args=(url, output_folder))
        thread.daemon = True
        thread.start()
        
    def do_conversion(self, url, output_folder):
        try:
            # Determine download format
            output_format = self.format_var.get()
            if output_format == "musicxml":
                download_format = "midi"  # For MusicXML, download MIDI first then convert
            else:
                download_format = output_format  # Download directly in requested format
                
            # Set correct extension for the downloaded file
            if download_format == "midi":
                file_ext = ".mid"
            else:
                file_ext = f".{download_format}"
                
            # Extract filename from URL
            import re
            match = re.search(r'/scores/(\d+)(?:-([^/]+))?', url)
            if match:
                base_name = match.group(2) or f"score_{match.group(1)}"
                base_name = base_name.replace('-', '_')
            else:
                base_name = f"musescore_{int(time.time())}"
                
            # Files paths
            download_path = os.path.join(output_folder, f"{base_name}{file_ext}")
            output_path = os.path.join(output_folder, f"{base_name}.xml" if output_format == "musicxml" else download_path)
            
            # Step 1: Download the file
            self.status_var.set(f"Downloading {download_format.upper()} from MuseScore...")
            self.update_idletasks()
            
            # Run dl-librescore to download the file
            command = [
                "npx", "dl-librescore@latest", 
                "-i", url,
                "-t", download_format,
                "-o", output_folder
            ]
            
            result = subprocess.run(command, capture_output=True, text=True)
            
            if result.returncode != 0:
                raise Exception(f"Download failed: {result.stderr}")
                
            # Step 2: Find the downloaded file
            self.status_var.set("Looking for downloaded file...")
            self.update_idletasks()
            
            # Wait a moment for file system to settle
            time.sleep(1)
            
            # Find the downloaded file
            found_file = None
            
            # First, look for a file with the same base name
            expected_file = os.path.join(output_folder, f"{base_name}{file_ext}")
            if os.path.exists(expected_file):
                found_file = expected_file
                
            # If not found, look for any file with the right extension, modified in the last minute
            if not found_file:
                recent_time = time.time() - 60  # One minute ago
                most_recent_file = None
                most_recent_time = 0
                
                for file in os.listdir(output_folder):
                    if file.endswith(file_ext):
                        file_path = os.path.join(output_folder, file)
                        mtime = os.path.getmtime(file_path)
                        if mtime > recent_time and mtime > most_recent_time:
                            most_recent_file = file_path
                            most_recent_time = mtime
                
                if most_recent_file:
                    found_file = most_recent_file
                    
            # If still not found, prompt user to select it manually
            if not found_file:
                self.status_var.set("Could not find downloaded file automatically. Please select it manually.")
                self.update_idletasks()
                
                # This needs to run in the main thread
                def ask_for_file():
                    nonlocal found_file
                    file_path = filedialog.askopenfilename(
                        title=f"Select the downloaded {download_format.upper()} file",
                        initialdir=output_folder,
                        filetypes=[(f"{download_format.upper()} Files", f"*{file_ext}"), ("All Files", "*.*")]
                    )
                    if file_path:
                        found_file = file_path
                        
                self.after(0, ask_for_file)
                
                # Wait for user selection
                while found_file is None:
                    time.sleep(0.1)
                    
            # If we have a file, proceed with conversion if needed
            if found_file:
                if output_format == "musicxml" and MUSIC21_INSTALLED:
                    self.status_var.set("Converting MIDI to MusicXML...")
                    self.update_idletasks()
                    
                    # Get the base name from the found file instead of the URL
                    found_file_basename = os.path.splitext(os.path.basename(found_file))[0]
                    output_path = os.path.join(output_folder, f"{found_file_basename}.xml")
                    
                    # Convert MIDI to MusicXML
                    score = converter.parse(found_file)
                    score.write('musicxml', fp=output_path)
                    
                    self.status_var.set(f"Conversion complete! File saved to: {output_path}")
                    
                    # Show success message and offer to open file or folder
                    def show_success():
                        if messagebox.askyesno("Success", 
                                          f"File successfully converted and saved as:\n{output_path}\n\nWould you like to open the output folder?"):
                            self.open_output_folder()
                    
                    self.after(0, show_success)
                else:
                    self.status_var.set(f"Download complete! File saved to: {found_file}")
                    
                    # Show success message
                    def show_success():
                        if messagebox.askyesno("Success", 
                                          f"File successfully downloaded as:\n{found_file}\n\nWould you like to open the output folder?"):
                            self.open_output_folder()
                    
                    self.after(0, show_success)
            else:
                raise Exception("Could not find the downloaded file. Please check the output folder manually.")
                
        except Exception as e:
            error_msg = str(e)
            self.status_var.set(f"Error: {error_msg}")
            
            # Show error in main thread
            def show_error():
                messagebox.showerror("Error", f"An error occurred:\n\n{error_msg}")
            
            self.after(0, show_error)
            
        finally:
            # Re-enable UI
            def reset_ui():
                self.convert_button.config(state=tk.NORMAL)
                self.progress.stop()
            
            self.after(0, reset_ui)
            
if __name__ == "__main__":
    app = SimpleConverter()
    app.mainloop()
