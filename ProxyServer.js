const express = require("express");
const fetch   = require("node-fetch");

const app  = express();
const PORT = process.env.PORT || 3000;

const ROBLOSECURITY_COOKIE = process.env.ROBLOX_COOKIE || "YOUR_.ROBLOSECURITY_COOKIE_HERE";

// Cache for presence data
const cache = new Map();
const CACHE_TTL_MS = 2000;

function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) { cache.delete(key); return null; }
    return entry.data;
}
function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// ============================================================
// GET /presence/:userId
// ============================================================
app.get("/presence/:userId", async (req, res) => {
    const userId = parseInt(req.params.userId);
    if (!userId || isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

    const cached = getCached("presence_" + userId);
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

        if (!response.ok) return res.status(502).json({ error: "Roblox API error", code: response.status });

        const data = await response.json();
        const presence = data.userPresences?.[0];
        if (!presence) return res.status(404).json({ error: "No presence data" });

        const result = {
            userPresenceType: presence.userPresenceType,
            placeId:          presence.placeId || null,
            gameId:           presence.gameId  || null,
            lastLocation:     presence.lastLocation || "",
        };

        setCache("presence_" + userId, result);
        return res.json(result);
    } catch (err) {
        console.error("Proxy error:", err);
        return res.status(500).json({ error: "Internal proxy error" });
    }
});

// ============================================================
// GET /resolvelink?code=XXX&placeId=YYY
// Resolves a private server link or share link to placeId+jobId
// ============================================================
app.get("/resolvelink", async (req, res) => {
    const { code, placeId } = req.query;
    if (!code) return res.status(400).json({ error: "Missing code" });

    const cacheKey = "link_" + code;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    try {
        // Try the sharelinks resolve API first (works for invite links)
        const shareResponse = await fetch("https://apis.roblox.com/sharelinks/v1/resolve", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Cookie": `.ROBLOSECURITY=${ROBLOSECURITY_COOKIE}`,
            },
            body: JSON.stringify({
                linkType: "ExperienceInvite",
                linkCode: code,
            }),
        });

        if (shareResponse.ok) {
            const shareData = await shareResponse.json();
            if (shareData && shareData.placeId && shareData.instanceId) {
                const result = { placeId: shareData.placeId, jobId: shareData.instanceId };
                setCache(cacheKey, result);
                return res.json(result);
            }
        }

        // Fallback: try private server link (privateServerLinkCode in URL)
        if (placeId) {
            const privateResponse = await fetch("https://gamejoin.roblox.com/v1/join-private-game", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Cookie": `.ROBLOSECURITY=${ROBLOSECURITY_COOKIE}`,
                },
                body: JSON.stringify({
                    placeId:  parseInt(placeId),
                    linkCode: code,
                }),
            });

            const privateData = await privateResponse.json();
            if (privateData && privateData.jobId) {
                const result = { placeId: parseInt(placeId), jobId: privateData.jobId };
                setCache(cacheKey, result);
                return res.json(result);
            }

            return res.status(404).json({ error: "Could not resolve link", raw: privateData });
        }

        return res.status(404).json({ error: "Could not resolve link" });

    } catch (err) {
        console.error("Resolvelink error:", err);
        return res.status(500).json({ error: "Internal proxy error" });
    }
});

app.get("/", (req, res) => res.send("Roblox Presence Proxy is running ✅"));

app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
