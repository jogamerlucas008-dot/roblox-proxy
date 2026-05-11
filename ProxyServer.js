// ============================================================
// ProxyServer.js
// A minimal Node.js proxy to fetch Roblox presence data.
// Deploy FREE on: https://render.com or https://railway.app
// ============================================================
//
// SETUP STEPS:
//   1. Install Node.js on your machine (nodejs.org)
//   2. Run: npm init -y && npm install express node-fetch
//   3. Add your .ROBLOSECURITY cookie below (use an alt account!)
//   4. Deploy to Render/Railway (free tier is fine)
//   5. Paste your deployed URL into PresenceHandler_ServerScript.lua
//
// WARNING: NEVER use your main Roblox account cookie.
//          Create a free alt account and use that cookie.
//          Make the target player a friend of that alt account,
//          OR use Open Cloud API key (see bottom of this file).
// ============================================================

const express = require("express");
const fetch   = require("node-fetch");

const app  = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// OPTION A: .ROBLOSECURITY cookie (alt account)
// Get it from: browser DevTools > Application > Cookies > .ROBLOSECURITY
// ============================================================
const ROBLOSECURITY_COOKIE = process.env.ROBLOX_COOKIE || "YOUR_.ROBLOSECURITY_COOKIE_HERE";

// ============================================================
// GET /presence/:userId
// Returns presence data for a given Roblox userId
// ============================================================
app.get("/presence/:userId", async (req, res) => {
    const userId = parseInt(req.params.userId);

    if (!userId || isNaN(userId)) {
        return res.status(400).json({ error: "Invalid userId" });
    }

    try {
        const response = await fetch("https://presence.roblox.com/v1/presence/users", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Cookie": `.ROBLOSECURITY=${ROBLOSECURITY_COOKIE}`,
            },
            body: JSON.stringify({ userIds: [userId] }),
        });

        if (!response.ok) {
            return res.status(502).json({ error: "Roblox API error", code: response.status });
        }

        const data = await response.json();
        const presence = data.userPresences?.[0];

        if (!presence) {
            return res.status(404).json({ error: "No presence data" });
        }

        // Return only what the Roblox game needs
        return res.json({
            userPresenceType: presence.userPresenceType,  // 0=Offline,1=Online,2=In-game,3=Studio
            placeId:          presence.placeId   || null,
            gameId:           presence.gameId    || null, // this is the JobId / server instance ID
            lastLocation:     presence.lastLocation || "",
        });

    } catch (err) {
        console.error("Proxy error:", err);
        return res.status(500).json({ error: "Internal proxy error" });
    }
});

// Health check endpoint
app.get("/", (req, res) => res.send("Roblox Presence Proxy is running ✅"));

app.listen(PORT, () => {
    console.log(`Proxy listening on port ${PORT}`);
});

// ============================================================
// OPTION B (Safer): Roblox Open Cloud API Key
// ------------------------------------------------------------
// Instead of a cookie, use an Open Cloud API key.
// 1. Go to: create.roblox.com > Credentials > Create API Key
// 2. Give it "User Presence" read permission
// 3. Replace the fetch call above with:
//
//   const response = await fetch("https://apis.roblox.com/cloud/v2/users/" + userId + "/presence", {
//       headers: {
//           "x-api-key": process.env.OPEN_CLOUD_API_KEY,
//       }
//   });
//
// Note: Open Cloud presence API may have different response shape.
//       Check docs.roblox.com/cloud for current schema.
// ============================================================
