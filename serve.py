import http.server
import socketserver
import os

# Define the port number you want to use
PORT = 8041

# Get the current working directory to serve files from
web_dir = os.getcwd()
print(f"Serving files from directory: {web_dir}")

# Use the SimpleHTTPRequestHandler to serve files from the current directory
Handler = http.server.SimpleHTTPRequestHandler

# Create the TCP server, binding to all available interfaces ("") and the specified port
# Using socketserver.TCPServer allows for easier handling
try:
    httpd = socketserver.TCPServer(("", PORT), Handler)
    print(f"\nServer started successfully!")
    print(f"Serving HTTP on http://localhost:{PORT}")
    print(f"Access your accordion app at: http://localhost:{PORT}/index.html")
    print("\nPress Ctrl+C to stop the server.")

    # Start the server's request loop
    # It will run until you stop it (e.g., with Ctrl+C)
    httpd.serve_forever()

except OSError as e:
    print(f"\nError: Could not start server on port {PORT}.")
    print(f"Details: {e}")
    print("The port might already be in use by another application.")

except KeyboardInterrupt:
    # Handle Ctrl+C gracefully
    print("\nShutting down the server...")
    httpd.shutdown()
    httpd.server_close()
    print("Server stopped.")


