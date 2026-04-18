#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# bootstrap.sh — one-shot server setup for a fresh Ubuntu 24.04 LTS droplet.
#
# Run once, AS ROOT, right after you SSH into the new droplet:
#
#     wget -O bootstrap.sh https://raw.githubusercontent.com/<user>/trimurti/main/deploy/bootstrap.sh
#     chmod +x bootstrap.sh
#     ./bootstrap.sh
#
# What it does:
#   1. Updates packages
#   2. Creates a non-root user `trimurti` with sudo + your SSH key
#   3. Hardens SSH (no root login, no password auth, custom port optional)
#   4. Installs Docker + Docker Compose plugin
#   5. Installs ufw firewall, allows only 22/80/443
#   6. Installs unattended-upgrades for security patches
#   7. Enables swap (4 GB — useful when RAM tight on a $24 droplet)
#   8. Clones the repo into /srv/trimurti and sets ownership
#
# After it finishes, log out and log back in as `trimurti`:
#     ssh trimurti@<DROPLET_IP>
# ---------------------------------------------------------------------------
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-trimurti}"
REPO_URL="${REPO_URL:-https://github.com/pesh2004/TRIMURTI.git}"
APP_DIR="${APP_DIR:-/srv/trimurti}"

if [[ $EUID -ne 0 ]]; then
  echo "bootstrap.sh must be run as root" >&2
  exit 1
fi

echo "==> Updating package index"
apt-get update -y
apt-get upgrade -y

echo "==> Installing base packages"
apt-get install -y \
  ca-certificates curl gnupg lsb-release \
  git ufw fail2ban \
  unattended-upgrades apt-listchanges \
  htop tmux rsync jq

# ---- Swap (4GB) ----------------------------------------------------------
if ! swapon --show | grep -q /swapfile; then
  echo "==> Creating 4GB swap"
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness = 10' > /etc/sysctl.d/99-swap.conf
  sysctl --system > /dev/null
fi

# ---- Deploy user --------------------------------------------------------
if ! id -u "$DEPLOY_USER" &>/dev/null; then
  echo "==> Creating user: $DEPLOY_USER"
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
  echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
  chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"
fi

# Copy root's authorized_keys to deploy user (DO adds your SSH key to root)
mkdir -p "/home/$DEPLOY_USER/.ssh"
if [[ -f /root/.ssh/authorized_keys ]]; then
  cp /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
chmod 700 "/home/$DEPLOY_USER/.ssh"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

# ---- SSH hardening ------------------------------------------------------
echo "==> Hardening SSH"
install -d -m 0755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-trimurti.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
AllowAgentForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
MaxAuthTries 3
LoginGraceTime 30
EOF
# Validate then try every reasonable way to pick up the new drop-in.
# Ubuntu 24.04 socket-activates ssh so the service can be inactive — we must
# not fail the whole bootstrap just because reload requires a running daemon.
sshd -t
systemctl reload-or-restart ssh 2>/dev/null \
  || systemctl reload-or-restart sshd 2>/dev/null \
  || systemctl restart ssh.socket 2>/dev/null \
  || true

# ---- fail2ban ----------------------------------------------------------
cat > /etc/fail2ban/jail.d/sshd.conf <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban

# ---- Firewall ----------------------------------------------------------
echo "==> Configuring firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     comment 'ssh'
ufw allow 80/tcp     comment 'http  (caddy challenges + redirect)'
ufw allow 443/tcp    comment 'https (caddy tls)'
ufw --force enable

# ---- Unattended upgrades -----------------------------------------------
echo "==> Enabling unattended-upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

# ---- Docker ------------------------------------------------------------
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
usermod -aG docker "$DEPLOY_USER"

# ---- App directory -----------------------------------------------------
echo "==> Preparing $APP_DIR"
mkdir -p "$APP_DIR" /srv/trimurti-backups
chown -R "$DEPLOY_USER:$DEPLOY_USER" /srv/trimurti /srv/trimurti-backups

if [[ ! -d "$APP_DIR/.git" ]]; then
  sudo -u "$DEPLOY_USER" git clone "$REPO_URL" "$APP_DIR" || \
    echo "NOTE: repo clone failed (likely private). You'll need to set up a deploy key and re-run:" \
    "sudo -u $DEPLOY_USER git clone $REPO_URL $APP_DIR"
fi

echo ""
echo "=========================================================="
echo " Bootstrap complete."
echo ""
echo "  Next steps from your laptop:"
echo "    1) Log out of root."
echo "    2) ssh $DEPLOY_USER@<this-droplet-ip>"
echo "    3) cd $APP_DIR"
echo "    4) cp deploy/.env.production.example .env"
echo "    5) Fill .env with real secrets (see SECURITY.md)"
echo "    6) ./deploy/deploy.sh"
echo ""
echo "  Optional — set up deploy key for private repo:"
echo "    ssh $DEPLOY_USER@<ip> 'ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N \"\"'"
echo "    ssh $DEPLOY_USER@<ip> 'cat ~/.ssh/id_ed25519.pub'"
echo "    Add that key to GitHub → Settings → Deploy keys"
echo "=========================================================="
