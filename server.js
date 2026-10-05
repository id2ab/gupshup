const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));


// =========================
// DATA
// =========================

const users = new Map();
const requests = new Map();


// =========================
// AVATARS
// =========================

const avatars = [
    "👨🏻", "👩🏻", "🧑🏻",
    "👨🏼", "👩🏼", "🧑🏼",
    "👨🏽", "👩🏽", "🧑🏽",
    "👨🏾", "👩🏾", "🧑🏾",
    "👨🏿", "👩🏿", "🧑🏿"
];

function randomAvatar() {

    return avatars[
        Math.floor(
            Math.random() * avatars.length
        )
    ];

}


// =========================
// DISTANCE
// =========================

function distanceKm(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371;

    const dLat =
        (lat2 - lat1) *
        Math.PI / 180;

    const dLon =
        (lon2 - lon1) *
        Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(
            lat1 * Math.PI / 180
        ) *
        Math.cos(
            lat2 * Math.PI / 180
        ) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );
}


// =========================
// GET USER
// =========================

function getUser(deviceId) {

    return users.get(deviceId);

}


// =========================
// GET SOCKET
// =========================

function getSocket(user) {

    if (!user)
        return null;

    return io.sockets.sockets.get(
        user.socketId
    );

}


// =========================
// DISCONNECT CURRENT CHAT
// =========================

function disconnectCurrentChat(user) {

    if (!user)
        return;

    if (!user.partner)
        return;

    const partner =
        getUser(user.partner);

    user.partner = null;

    if (!partner)
        return;

    partner.partner = null;

    const partnerSocket =
        getSocket(partner);

    if (partnerSocket) {

        partnerSocket.emit(
            "stranger-left"
        );

    }

}


// =========================
// SOCKET CONNECTION
// =========================

io.on(
    "connection",
    (socket) => {

        console.log(
            "Connected:",
            socket.id
        );


        // =========================
        // REGISTER USER
        // =========================

        socket.on(
            "register",
            (data) => {

                if (
                    !data ||
                    !data.deviceId
                ) {
                    return;
                }


                let user =
                    users.get(
                        data.deviceId
                    );


                if (!user) {

                    user = {

                        deviceId:
                            data.deviceId,

                        socketId:
                            socket.id,

                        avatar:
                            randomAvatar(),

                        name:
                            "Stranger",

                        lat:
                            null,

                        lng:
                            null,

                        online:
                            true,

                        partner:
                            null

                    };


                    users.set(
                        data.deviceId,
                        user
                    );

                }

                else {

                    user.socketId =
                        socket.id;

                    user.online =
                        true;

                }


                socket.deviceId =
                    data.deviceId;


                socket.emit(
                    "profile",
                    {

                        id:
                            user.deviceId,

                        avatar:
                            user.avatar,

                        name:
                            user.name

                    }
                );


                console.log(
                    "Registered:",
                    user.deviceId,
                    "| Socket:",
                    socket.id
                );


                console.log(
                    "DEVICE INFO:",
                    socket.deviceId,
                    "| User-Agent:",
                    socket.handshake.headers["user-agent"]
                );

            }
        );


        // =========================
        // LOCATION
        // =========================

        socket.on(
            "location",
            (location) => {

                const user =
                    getUser(
                        socket.deviceId
                    );


                if (!user) {

                    console.log(
                        "LOCATION ERROR: user not found"
                    );

                    return;
                }


                if (
                    !location ||
                    typeof location.lat !== "number" ||
                    typeof location.lng !== "number"
                ) {

                    console.log(
                        "LOCATION INVALID:",
                        socket.deviceId
                    );

                    return;
                }


                user.lat =
                    location.lat;

                user.lng =
                    location.lng;


                console.log(
                    "LOCATION OK:",
                    socket.deviceId
                );

            }
        );


        // =========================
        // RADAR
        // =========================

        socket.on(
            "get-radar-users",
            () => {

                const currentUser =
                    getUser(
                        socket.deviceId
                    );


                if (!currentUser)
                    return;


                if (
                    typeof currentUser.lat !==
                        "number" ||
                    typeof currentUser.lng !==
                        "number"
                ) {

                    socket.emit(
                        "radar-users",
                        []
                    );

                    return;
                }


                const nearbyUsers = [];


                for (
                    const [
                        id,
                        user
                    ]
                    of users
                ) {

                    if (
                        id ===
                        currentUser.deviceId
                    ) {
                        continue;
                    }


                    if (!user.online)
                        continue;


                    if (
                        typeof user.lat !==
                            "number" ||
                        typeof user.lng !==
                            "number"
                    ) {
                        continue;
                    }


                    const distance =
                        distanceKm(
                            currentUser.lat,
                            currentUser.lng,
                            user.lat,
                            user.lng
                        );


                    console.log(
                        "RADAR DISTANCE:",
                        currentUser.deviceId,
                        "->",
                        user.deviceId,
                        distance,
                        "KM"
                    );


                    if (distance <= 25) {

                        nearbyUsers.push(
                            {

                                id:
                                    user.deviceId,

                                avatar:
                                    user.avatar,

                                name:
                                    user.name,

                                distance:
                                    Number(
                                        distance.toFixed(1)
                                    )

                            }
                        );

                    }

                }


                socket.emit(
                    "radar-users",
                    nearbyUsers
                );

            }
        );


        // =========================
// CONNECTION REQUEST
// =========================

socket.on(
    "send-request",
    (data) => {

        // Frontend currently sends selectedUser.id directly
        // Also support object format for compatibility
        const targetId =
            typeof data === "string"
                ? data
                : data?.targetId;

        if (!targetId) {
            return;
        }


        const sender =
            getUser(
                socket.deviceId
            );


        const receiver =
            getUser(
                targetId
            );


        if (!sender)
            return;

        if (!receiver)
            return;


        if (
            sender.deviceId ===
            receiver.deviceId
        ) {
            return;
        }


        if (!receiver.online)
            return;


        if (sender.partner)
            return;


        if (receiver.partner)
            return;


        const receiverSocket =
            getSocket(
                receiver
            );


        if (!receiverSocket)
            return;


        const requestId =
            "REQ-" +
            Date.now() +
            "-" +
            Math.random()
                .toString(36)
                .slice(2, 8);


        const request = {

            requestId:
                requestId,

            sender:
                sender.deviceId,

            receiver:
                receiver.deviceId

        };


        requests.set(
            requestId,
            request
        );


        receiverSocket.emit(
            "connection-request",
            {

                requestId:
                    requestId,

                avatar:
                    sender.avatar,

                name:
                    sender.name

            }
        );


        socket.emit(
            "request-sent",
            {

                requestId:
                    requestId,

                targetId:
                    receiver.deviceId

            }
        );


        console.log(
            "Request:",
            sender.deviceId,
            "->",
            receiver.deviceId
        );

    }
);

        // =========================
        // ACCEPT REQUEST
        // =========================

        socket.on(
            "accept-request",
            (requestId) => {

                const request =
                    requests.get(
                        requestId
                    );


                if (!request)
                    return;


                if (
                    request.receiver !==
                    socket.deviceId
                ) {
                    return;
                }


                const receiver =
                    getUser(
                        request.receiver
                    );


                const sender =
                    getUser(
                        request.sender
                    );


                if (!receiver)
                    return;

                if (!sender)
                    return;


                /*
                 * अगर receiver पहले से किसी
                 * chat में है तो पुरानी chat
                 * disconnect होगी.
                 */

                if (receiver.partner) {

                    disconnectCurrentChat(
                        receiver
                    );

                }


                /*
                 * Sender अगर पहले से chat
                 * में है तो request reject.
                 */

                if (sender.partner) {

                    const senderSocket =
                        getSocket(
                            sender
                        );


                    if (senderSocket) {

                        senderSocket.emit(
                            "request-busy"
                        );

                    }


                    requests.delete(
                        requestId
                    );

                    return;
                }


                receiver.partner =
                    sender.deviceId;

                sender.partner =
                    receiver.deviceId;


                const receiverSocket =
                    getSocket(
                        receiver
                    );

                const senderSocket =
                    getSocket(
                        sender
                    );


                /*
                 * Sender enters chat
                 */

                if (senderSocket) {

                    senderSocket.emit(
                        "request-accepted",
                        {

                            avatar:
                                receiver.avatar,

                            name:
                                receiver.name

                        }
                    );

                }


                /*
                 * Receiver enters chat
                 */

                if (receiverSocket) {

                    receiverSocket.emit(
                        "request-accepted",
                        {

                            avatar:
                                sender.avatar,

                            name:
                                sender.name

                        }
                    );

                }


                /*
                 * Accepted request delete
                 */

                requests.delete(
                    requestId
                );


                console.log(
                    "Accepted:",
                    sender.deviceId,
                    "<->",
                    receiver.deviceId
                );

            }
        );


        // =========================
        // REJECT REQUEST
        // =========================

        socket.on(
            "reject-request",
            (requestId) => {

                const request =
                    requests.get(
                        requestId
                    );


                if (!request)
                    return;


                if (
                    request.receiver !==
                    socket.deviceId
                ) {
                    return;
                }


                const sender =
                    getUser(
                        request.sender
                    );


                if (sender) {

                    const senderSocket =
                        getSocket(
                            sender
                        );


                    if (senderSocket) {

                        senderSocket.emit(
                            "request-rejected"
                        );

                    }

                }


                requests.delete(
                    requestId
                );


                console.log(
                    "Rejected:",
                    requestId
                );

            }
        );


        // =========================
        // TYPING INDICATOR
        // =========================

        socket.on(
            "typing",
            (state) => {

                const user =
                    getUser(
                        socket.deviceId
                    );


                if (!user)
                    return;


                if (!user.partner)
                    return;


                const partner =
                    getUser(
                        user.partner
                    );


                if (!partner)
                    return;


                const partnerSocket =
                    getSocket(
                        partner
                    );


                if (!partnerSocket)
                    return;


                partnerSocket.emit(
                    "typing",
                    Boolean(state)
                );

            }
        );


        // =========================
        // CHAT MESSAGE
        // =========================

        socket.on(
            "message",
            (message) => {

                const user =
                    getUser(
                        socket.deviceId
                    );


                if (!user)
                    return;


                if (!user.partner)
                    return;


                const partner =
                    getUser(
                        user.partner
                    );


                if (!partner)
                    return;


                const partnerSocket =
                    getSocket(
                        partner
                    );


                if (!partnerSocket)
                    return;


                partnerSocket.emit(
                    "message",
                    {

                        text:
                            String(message)
                                .slice(
                                    0,
                                    1000
                                )

                    }
                );

            }
        );


        // =========================
        // DISCONNECT CURRENT CHAT
        // =========================

        socket.on(
            "next-stranger",
            () => {

                const user =
                    getUser(
                        socket.deviceId
                    );


                if (!user)
                    return;


                if (!user.partner)
                    return;


                const partner =
                    getUser(
                        user.partner
                    );


                user.partner =
                    null;


                if (partner) {

                    partner.partner =
                        null;


                    const partnerSocket =
                        getSocket(
                            partner
                        );


                    if (partnerSocket) {

                        partnerSocket.emit(
                            "stranger-left"
                        );

                    }

                }


                socket.emit(
                    "stranger-left"
                );


                console.log(
                    "Chat disconnected:",
                    user.deviceId
                );

            }
        );


        // =========================
        // SOCKET DISCONNECT
        // =========================

        socket.on(
            "disconnect",
            (reason) => {

                const user =
                    getUser(
                        socket.deviceId
                    );


                if (!user)
                    return;


                /*
                 * अगर इसी device का नया socket
                 * पहले ही connect हो चुका है,
                 * तो पुराने socket को ignore करें।
                 */

                if (
                    user.socketId &&
                    user.socketId !== socket.id
                ) {

                    console.log(
                        "Old socket disconnected:",
                        user.deviceId,
                        "| Socket:",
                        socket.id,
                        "| Reason:",
                        reason
                    );

                    return;

                }


                user.online =
                    false;


                // अगर chat में था

                if (user.partner) {

                    const partner =
                        getUser(
                            user.partner
                        );


                    if (partner) {

                        partner.partner =
                            null;


                        const partnerSocket =
                            getSocket(
                                partner
                            );


                        if (partnerSocket) {

                            partnerSocket.emit(
                                "stranger-left"
                            );

                        }

                    }


                    user.partner =
                        null;

                }


                // Pending requests साफ करें

                for (
                    const [
                        id,
                        request
                    ]
                    of requests
                ) {

                    if (
                        request.sender ===
                        user.deviceId ||

                        request.receiver ===
                        user.deviceId
                    ) {

                        requests.delete(
                            id
                        );

                    }

                }


                console.log(
                    "Disconnected:",
                    user.deviceId,
                    "| Socket:",
                    socket.id,
                    "| Reason:",
                    reason
                );

            }
        );

    }
);


// =========================
// HOME
// =========================

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            __dirname +
            "/public/index.html"
        );

    }
);


// =========================
// START SERVER
// =========================

server.listen(
    PORT,
    () => {

        console.log(
            `GupShup Radar running at http://localhost:${PORT}`
        );

    }
);
