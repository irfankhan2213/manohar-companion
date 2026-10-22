# Deploying Manohar Companion on Microsoft Azure ($100 Student Credit)

With your **Azure for Students ($100 credit)**, you can host the entire Manohar Companion stack (Web App + SQLite Backend API + Database) for **100% free** in Microsoft's India Datacenter (**Central India - Pune** or **South India - Chennai**).

---

## Architecture

Our application is built as a **unified production system**:
* **Port 80/443**: The Node 22 server serves both the React mobile web app (`/`) and the REST API (`/api/*`).
* **Persistent SQLite**: Automatically stores data in `/data/manohar.sqlite`.
* **RAM footprint**: ~60–80 MB total (leaves >900 MB free on a standard 1 GB VM).

---

## Step 1: Create a Linux Virtual Machine in Azure Portal

1. Log in to [portal.azure.com](https://portal.azure.com) with your student account.
2. Search for **Virtual Machines** $\rightarrow$ Click **Create** $\rightarrow$ **Azure Virtual Machine**.
3. Fill in the basics:
   * **Subscription:** *Azure for Students* (uses your $100 credit)
   * **Resource Group:** Create new: `rg-manohar`
   * **Virtual Machine Name:** `manohar-server`
   * **Region:** `Central India` (Pune) or `South India` (Chennai) for fastest response across India
   * **Image:** `Ubuntu Server 24.04 LTS - x64 Gen2`
   * **Size:**
     * **Option A (Free Tier):** `Standard_B1s` (1 vCPU, 1 GiB RAM) — **$0 / month** (included in Azure 12-month free services).
     * **Option B (Faster Build):** `Standard_B2s` (2 vCPU, 4 GiB RAM) — ~$14 / month (covers 7+ months on your $100 credit).
   * **Authentication Type:** *SSH public key* (or *Password* for simple login).
   * **Inbound Port Rules:** Check **SSH (22)**, **HTTP (80)**, and **HTTPS (443)**.
4. Click **Review + create** $\rightarrow$ **Create**.

---

## Step 2: Connect to Your Azure VM

Once deployed, copy your VM's **Public IP address** (e.g., `20.198.xxx.xxx`) from the Azure Portal overview page.

Open Terminal (on your Mac) and connect:
```bash
ssh azureuser@<YOUR-AZURE-PUBLIC-IP>
```
*(Or use the password if you selected password authentication).*

---

## Step 3: Run the One-Line Setup

Run the following commands on your Azure VM to install Docker & start the app:

```bash
# 1. Install Docker & Git
sudo apt update && sudo apt install -y git docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker $USER

# 2. Clone your repository
git clone https://github.com/irfankhan2213/saas-manohar-traders.git app
cd app

# 3. Launch with Docker Compose
docker compose up -d --build
```

That's it! Your entire Manohar Companion system is now live at:
`http://<YOUR-AZURE-PUBLIC-IP>/`

---

## Step 4: Add Free HTTPS (SSL) with Domain (Optional, 2 Minutes)

If you claim a free `.me` or `.tech` domain from the GitHub Student Developer Pack (or already have one):

1. Point your domain's **A Record** to your Azure VM Public IP (`20.198.xxx.xxx`).
2. Install Caddy or Certbot on the VM:
```bash
sudo apt install -y certbot
# or run Caddy reverse proxy for automated 1-click HTTPS
```

---

## Verifying the Deployment

* **Web App:** Open `http://<YOUR-AZURE-PUBLIC-IP>/` on any mobile phone or browser.
* **Health Check:** `http://<YOUR-AZURE-PUBLIC-IP>/api/health` returns `{"status":"ok"}`.
* **Tally Sync:** In `@saas/agent` on the office Windows PC, set `SERVER_URL=http://<YOUR-AZURE-PUBLIC-IP>` to sync live with your Azure cloud!
