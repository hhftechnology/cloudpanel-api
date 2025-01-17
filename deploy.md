To deploy the project, you need to:

1. Place these files in your project:
   - deploy.sh → root directory
   - cloudpanel-api.service → systemd/ directory
   - cloudpanel-api → logrotate/ directory

2. Prepare your server by installing required packages:
```bash
apt update
apt install -y nodejs npm sqlite3 logrotate
```

3. Upload your project files and run the deployment:
```bash
chmod +x deploy.sh
./deploy.sh
```

4. After deployment, verify everything is running:
```bash
systemctl status cloudpanel-api
systemctl status cloudpanel-queue
```

5. Check the logs for any issues:
```bash
tail -f /home/clp/logs/api/output.log
tail -f /home/clp/logs/api/error.log
```

The deployment script handles:
- Backing up any existing deployment
- Setting up directory structure
- Installing dependencies
- Configuring services
- Setting proper permissions
- Starting required services