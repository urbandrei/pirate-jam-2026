#!/bin/bash

# Pirate Jam 2026 - Game Server Runner
# Usage:
#   ./run.sh                    - Run everything on port 3000 (default)
#   ./run.sh --separate-ports   - Run game API on 3000, PC on 3001, VR on 3002

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default ports
GAME_PORT=${GAME_PORT:-3000}
PC_PORT=${PC_PORT:-3001}
VR_PORT=${VR_PORT:-3002}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Function to cleanup background processes on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down servers...${NC}"
    kill $(jobs -p) 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════╗"
    echo "║                                                   ║"
    echo "║     🏴‍☠️  PIRATE JAM 2026  🏴‍☠️                       ║"
    echo "║         Giants vs Tiny Players                    ║"
    echo "║                                                   ║"
    echo "╚═══════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check for separate ports mode
if [ "$1" == "--separate-ports" ]; then
    print_banner
    echo -e "${BLUE}Mode: Separate Ports${NC}"
    echo ""

    # Start main game server (API + Socket.IO)
    echo -e "${GREEN}[1/3] Starting game server on port ${GAME_PORT}...${NC}"
    PORT=$GAME_PORT node server/index.js &
    GAME_PID=$!

    # Wait for server to start
    sleep 2

    # Check if npx is available
    if ! command -v npx &> /dev/null; then
        echo -e "${RED}npx not found. Please install Node.js 8.2+${NC}"
        exit 1
    fi

    # Start PC client static server (serves public folder with /pc as root)
    echo -e "${GREEN}[2/3] Starting PC client on port ${PC_PORT}...${NC}"
    npx serve public -l $PC_PORT --no-clipboard -s 2>/dev/null &
    PC_PID=$!

    # Start VR client static server (serves public folder with /vr as root)
    echo -e "${GREEN}[3/3] Starting VR client on port ${VR_PORT}...${NC}"
    npx serve public -l $VR_PORT --no-clipboard -s 2>/dev/null &
    VR_PID=$!

    sleep 2
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  All servers running!                             ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                   ║${NC}"
    echo -e "${GREEN}║  Game Server: ${CYAN}http://localhost:${GAME_PORT}${GREEN}              ║${NC}"
    echo -e "${GREEN}║  PC Client:   ${CYAN}http://localhost:${PC_PORT}/pc/${GREEN}           ║${NC}"
    echo -e "${GREEN}║  VR Client:   ${CYAN}http://localhost:${VR_PORT}/vr/${GREEN}           ║${NC}"
    echo -e "${GREEN}║                                                   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Clients auto-connect to game server at localhost:${GAME_PORT}${NC}"
    echo ""
    echo -e "Press ${RED}Ctrl+C${NC} to stop all servers"
    echo ""

    # Wait for all background processes
    wait

else
    # Default mode: single server serves everything
    print_banner
    echo -e "${BLUE}Mode: Single Server (recommended)${NC}"
    echo ""
    echo -e "${GREEN}Starting server on port ${GAME_PORT}...${NC}"
    echo ""

    # Set port and run
    PORT=$GAME_PORT node server/index.js
fi
