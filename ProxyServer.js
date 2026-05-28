const express = require("express");
const fetch   = require("node-fetch");

const app  = express();
const PORT = process.env.PORT || 3000;

const ROBLOSECURITY_COOKIE = process.env.ROBLOX_COOKIE || "YOUR_.ROBLOSECURITY_COOKIE_HERE";

// Cache
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
        console.error("Presence error:", err);
        return res.status(500).json({ error: "Internal proxy error" });
    }
});

// ============================================================
// GET /resolvelink?code=XXX&placeId=YYY
// ============================================================
app.get("/resolvelink", async (req, res) => {
    const { code, placeId } = req.query;
    if (!code) return res.status(400).json({ error: "Missing code" });

    const cacheKey = "link_" + code;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    try {
        // Attempt 1: sharelinks resolve API (for /share?code= links)
        console.log("[resolvelink] Trying sharelinks API with code:", code);
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

        const shareText = await shareResponse.text();
        console.log("[resolvelink] sharelinks status:", shareResponse.status, "body:", shareText);

        if (shareResponse.ok) {
            let shareData;
            try { shareData = JSON.parse(shareText); } catch(e) {}
            if (shareData && shareData.placeId && shareData.instanceId) {
                const result = { placeId: shareData.placeId, jobId: shareData.instanceId };
                setCache(cacheKey, result);
                return res.json(result);
            }
        }

        // Attempt 2: private server link (for ?privateServerLinkCode= links)
        if (placeId) {
            console.log("[resolvelink] Trying private server API with placeId:", placeId, "code:", code);
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

            const privateText = await privateResponse.text();
            console.log("[resolvelink] private server status:", privateResponse.status, "body:", privateText);

            let privateData;
            try { privateData = JSON.parse(privateText); } catch(e) {}

            if (privateData && privateData.jobId) {
                const result = { placeId: parseInt(placeId), jobId: privateData.jobId };
                setCache(cacheKey, result);
                return res.json(result);
            }

            return res.status(404).json({ error: "Could not resolve link", shareRaw: shareText, privateRaw: privateText });
        }

        return res.status(404).json({ error: "Could not resolve link", shareRaw: shareText });

    } catch (err) {
        console.error("Resolvelink error:", err);
        return res.status(500).json({ error: "Internal proxy error", details: err.message });
    }
});

app.get("/", (req, res) => res.send("Roblox Presence Proxy is running ✅"));

app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
