#!/bin/bash

# ====================================
# FBO Extension - Get Machine ID (Mac/Linux)
# ====================================
# Usage: Run this in Terminal (no Node.js required)
#   chmod +x get-machine-id.sh
#   ./get-machine-id.sh

echo "===================================="
echo "🔑 FBO EXTENSION LICENSE INFO"
echo "===================================="
echo ""

# Get Machine ID from IOPlatformUUID (Mac)
if [[ "$OSTYPE" == "darwin"* ]]; then
    machineId=$(ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID | awk '{print $3}' | tr -d '"')

    if [ -z "$machineId" ]; then
        echo "❌ Error: Could not read IOPlatformUUID"
        exit 1
    fi

    echo "Platform: macOS"
    echo ""
    echo "Raw Machine ID:"
    echo "$machineId"
    echo ""

    # Hash the Machine ID using SHA-256
    hashedId=$(echo -n "$machineId" | shasum -a 256 | awk '{print $1}')

    echo "Hashed Machine ID (SHA-256):"
    echo "$hashedId"
    echo ""

    echo "===================================="
    echo "📋 ADD THIS TO SERVER allowedIds:"
    echo "===================================="
    echo ""
    echo "[\"Your Name - Mac\", \"$hashedId\"]"
    echo ""

else
    echo "❌ Error: This script is for macOS only"
    echo "For Windows, use: get-machine-id.ps1"
    exit 1
fi
