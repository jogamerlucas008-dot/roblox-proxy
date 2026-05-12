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

const ROBLOSECURITY_COOKIE = process.env.ROBLOX_COOKIE || "YOUR_.ROBLOSECURITY_COOKIE_HERE";

// ============================================================
// CACHE — stores presence data per userId for 2 seconds
// Prevents 429 rate limits even with 0.1s refresh rate
// ============================================================
const cache = new Map();
const CACHE_TTL_MS = 2000;

function getCached(userId) {
    const entry = cache.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        cache.delete(userId);
        return null;
    }
    return entry.data;
}

function setCache(userId, data) {
    cache.set(userId, { data, timestamp: Date.now() });
}

// ============================================================
// GET /presence/:userId
// Returns presence data for a given Roblox userId
// ============================================================
app.get("/presence/:userId", async (req, res) => {
    const userId = parseInt(req.params.userId);

    if (!userId || isNaN(userId)) {
        return res.status(400).json({ error: "Invalid userId" });
    }

    // Return cached response if fresh enough
    const cached = getCached(userId);
    if (cached) return res.json(cached);

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

        const result = {
            userPresenceType: presence.userPresenceType,
            placeId:          presence.placeId   || null,
            gameId:           presence.gameId    || null,
            lastLocation:     presence.lastLocation || "",
        };

        setCache(userId, result);
        return res.json(result);

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
