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

    if (!deviceId)
        return null;

    return users.get(deviceId);
}


// =========================
// GET SOCKET
// =========================

function getSocket(user) {

    if (!user)
        return null;

    if (!user.socketId)
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

                    console.log(
                        "REGISTER INVALID"
                    );

                    return;
                }

                const deviceId =
                    String(
                        data.deviceId
                    );

                let user =
                    users.get(
                        deviceId
                    );


                // =========================
                // NEW USER
                // =========================

                if (!user) {

                    user = {

                        deviceId:
                            deviceId,

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
                        deviceId,
                        user
                    );

                }


                // =========================
                // EXISTING USER
                // =========================

                else {

                    user.socketId =
                        socket.id;

                    user.online =
                        true;

                }


                socket.deviceId =
                    deviceId;


                console.log(
                    "Registered:",
                    deviceId,
                    "| Socket:",
                    socket.id
                );


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

                user.online =
                    true;


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
                    currentUser.lat === null ||
                    currentUser.lng === null
                ) {

                    socket.emit(
                        "radar-users",
                        []
                    );

                    return;
                }


                const radarUsers = [];


                for (
                    const user
                    of users.values()
                ) {

                    if (
                        user.deviceId ===
                        currentUser.deviceId
                    ) {

                        continue;
                    }


                    if (!user.online)
                        continue;


                    if (
                        user.lat === null ||
                        user.lng === null
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


                    // =========================
                    // 25 KM RADAR RANGE
                    // =========================

                    console.log("RADAR DISTANCE:", currentUser.deviceId, "->", user.deviceId, distance, "KM");
                    if (distance <= 25) {

                        radarUsers.push(
                            {

                                id:
                                    user.deviceId,

                                avatar:
                                    user.avatar,

                                name:
                                    user.name,

                                distance:
                                    Math.round(
                                        distance * 10
                                    ) / 10

                            }
                        );

                    }

                }


                // =========================
                // NEAREST FIRST
                // =========================

                radarUsers.sort(
                    (a, b) =>
                        a.distance -
                        b.distance
                );


                // =========================
                // MAXIMUM 60 USERS
                // =========================

                socket.emit(
                    "radar-users",
                    radarUsers.slice(
                        0,
                        60
                    )
                );

            }
        );


        // =========================
        // SEND CONNECTION REQUEST
        // =========================

        socket.on(
            "send-request",
            (targetId) => {

                const sender =
                    getUser(
                        socket.deviceId
                    );

                const receiver =
                    getUser(
                        targetId
                    );


                if (
                    !sender ||
                    !receiver
                ) {

                    return;
                }


                if (
                    sender.deviceId ===
                    receiver.deviceId
                ) {

                    return;
                }


                if (!receiver.online)
                    return;


                const requestId =
                    `${sender.deviceId}_${receiver.deviceId}`;


                // =========================
                // DUPLICATE REQUEST
                // =========================

                if (
                    requests.has(
                        requestId
                    )
                ) {

                    socket.emit(
                        "request-error",
                        "Request already sent."
                    );

                    return;
                }


                requests.set(
                    requestId,
                    {

                        sender:
                            sender.deviceId,

                        receiver:
                            receiver.deviceId

                    }
                );


                const receiverSocket =
                    getSocket(
                        receiver
                    );


                if (!receiverSocket) {

                    requests.delete(
                        requestId
                    );

                    return;
                }


                // =========================
                // SEND REQUEST TO RECEIVER
                // =========================

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


                // =========================
                // SENDER CONFIRMATION
                // =========================

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


                // केवल receiver accept करेगा

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

                const receiver =
                    getUser(
                        request.receiver
                    );


                if (
                    !sender ||
                    !receiver
                ) {

                    requests.delete(
                        requestId
                    );

                    return;
                }


                // =========================
                // AUTO SWITCH
                // =========================

                if (receiver.partner) {

                    console.log(
                        "Auto disconnect receiver:",
                        receiver.deviceId,
                        "<->",
                        receiver.partner
                    );

                    disconnectCurrentChat(
                        receiver
                    );

                }


                if (sender.partner) {

                    console.log(
                        "Auto disconnect sender:",
                        sender.deviceId,
                        "<->",
                        sender.partner
                    );

                    disconnectCurrentChat(
                        sender
                    );

                }


                // =========================
                // CONNECT BOTH USERS
                // =========================

                sender.partner =
                    receiver.deviceId;

                receiver.partner =
                    sender.deviceId;


                const senderSocket =
                    getSocket(
                        sender
                    );

                const receiverSocket =
                    getSocket(
                        receiver
                    );


                // =========================
                // SENDER ENTERS CHAT
                // =========================

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


                // =========================
                // RECEIVER ENTERS CHAT
                // =========================

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
                            String(
                                message
                            ).slice(
                                0,
                                1000
                            )

                    }
                );

            }
        );


        // =========================
        // NEXT STRANGER
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


                // =========================
                // OLD SOCKET CHECK
                // =========================

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


                // =========================
                // CURRENT CHAT
                // =========================

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


                // =========================
                // REMOVE PENDING REQUESTS
                // =========================

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
