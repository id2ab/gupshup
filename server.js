const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

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
// DISCONNECT A CURRENT CHAT
// =========================
//
// यह function Auto Switch के लिए है.
//
// अगर किसी user की पहले से chat चल रही है,
// तो उसकी पुरानी chat को साफ करेगा
// और दूसरे user को "stranger-left" भेजेगा.
//

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


                if (!user)
                    return;


                if (
                    !location ||
                    typeof location.lat !==
                        "number" ||
                    typeof location.lng !==
                        "number"
                ) {

                    return;

                }


                user.lat =
                    location.lat;

                user.lng =
                    location.lng;

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


                    // 25 KM radar range

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


                // Nearest first

                radarUsers.sort(
                    (a, b) =>
                        a.distance -
                        b.distance
                );


                // Maximum 60 strangers

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


                /*
                 * Busy user को भी request भेज सकते हैं.
                 *
                 * इससे current chat में मौजूद
                 * user भी नई request receive कर सकता है.
                 */


                const requestId =
                    `${sender.deviceId}_${receiver.deviceId}`;


                // Duplicate request रोकें

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


                // Receiver को request

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


                // Sender confirmation

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


                // केवल receiver accept कर सकता है

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
                //
                // अगर receiver किसी पुरानी chat में है
                // तो पहले वह पुरानी chat बंद होगी.
                //
                // अगर sender भी किसी पुरानी chat में है
                // तो उसकी पुरानी chat भी बंद होगी.
                //
                // उसके बाद दोनों नई chat में connect होंगे.
                // =========================


                if (receiver.partner) {

                    console.log(
                        "Auto disconnect receiver old chat:",
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
                        "Auto disconnect sender old chat:",
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


                // Request complete

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
            () => {

                const user =
                    getUser(
                        socket.deviceId
                    );


                if (!user)
                    return;


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
                    user.deviceId
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