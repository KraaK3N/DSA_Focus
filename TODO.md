#Improvements
-> [x] The timer does not allow us to increase or decrease while active. Fix This. (Fixed)
-> How to sync the local to the droplet version?
-> [x] Can we just have like a white scratch board below the timer for listing main task for the day (can we have like notion style /todo to create check box, list etc but keep it minimal) (Fixed)
-> +- button to set daily goal
-> also time zone is not IST I guess. 

Yes, you absolutely can! Running your app on a VPS (like a DigitalOcean Droplet) is a very common way to host web
  applications.

  Here is a brief explanation of how it works and the steps to do it:
  ──────
  ### 1. How it works

  Your VPS acts just like your local computer, but it is running 24/7 in the cloud and has a Public IP Address (e.g., 
  192.0.2.1 ).

  When you start your Node.js server on the VPS, it listens for incoming traffic. You can then access the app in your browser
  by going to  http://<your-vps-ip>:3000 .
  ──────
  ### 2. Basic Steps to Set It Up

  1. Get the code onto the VPS:
  Push your codebase to a private/public GitHub repository, SSH into your VPS, and clone the repository there.
  2. Install Node.js & Dependencies:
  Install Node.js on your VPS (usually running Linux Ubuntu). Navigate to your app directory and run:
    npm install

  3. Run it continuously in the background (using PM2):
  If you run  npm start  directly, the server will stop the moment you close your terminal. Instead, you use a process
  manager like PM2 to keep it running 24/7:
    npm install -g pm2
    pm2 start server.js --name "dsa-dashboard"

  4. Open the Firewall:
  Ensure your VPS firewall allows traffic on port  3000 . For example, on Ubuntu you would run:
    sudo ufw allow 3000

  5. Access the App:
  Open your browser and navigate to  http://<your-vps-ip>:3000 .
  ──────
  ### 3. The Professional Setup (Production)

  For a production-ready application, exposing port  3000  directly is usually avoided. Instead, developers set up a Reverse
  Proxy:

  • You install Nginx on the VPS to listen on the standard web ports ( 80  for HTTP,  443  for HTTPS).
  • Nginx receives the traffic and forwards it to your Node app running internally on port  3000 .
  • This allows you to easily map a custom domain (e.g.,  my-dsa-tracker.com ) and get a free SSL certificate (HTTPS) using
  Certbot / Let's Encrypt.
