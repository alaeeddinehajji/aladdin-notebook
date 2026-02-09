const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3002;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(200);
  res.end("Excalidraw collaboration server");
});

const io = new Server(server, {
  transports: ["websocket", "polling"],
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  allowEIO3: true,
  maxHttpBufferSize: 10e6, // 10 MB
});

// Track which users are following whom
// Map<roomId, Map<visitorSocketId, followedSocketId>>
const roomFollows = new Map();

io.on("connection", (socket) => {
  io.to(socket.id).emit("init-room");

  socket.on("join-room", (roomId) => {
    socket.join(roomId);

    const sockets = Array.from(
      io.sockets.adapter.rooms.get(roomId) || [],
    );

    if (sockets.length <= 1) {
      // First user in the room
      io.to(socket.id).emit("first-in-room");
    } else {
      // Notify existing users about the new user
      socket.broadcast.to(roomId).emit("new-user", socket.id);
    }

    // Broadcast updated user list to everyone in the room
    io.in(roomId).emit(
      "room-user-change",
      sockets,
    );
  });

  // Reliable broadcast (scene updates)
  socket.on(
    "server-broadcast",
    (roomId, encryptedData, iv) => {
      socket.broadcast.to(roomId).emit("client-broadcast", encryptedData, iv);
    },
  );

  // Volatile broadcast (cursor positions, laser pointers, idle status)
  socket.on(
    "server-volatile-broadcast",
    (roomId, encryptedData, iv) => {
      socket.volatile.broadcast
        .to(roomId)
        .emit("client-broadcast", encryptedData, iv);
    },
  );

  // User follow
  socket.on("user-follow", (payload) => {
    // Find which room this socket is in
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    if (rooms.length === 0) {
      return;
    }
    const roomId = rooms[0];

    if (!roomFollows.has(roomId)) {
      roomFollows.set(roomId, new Map());
    }
    const follows = roomFollows.get(roomId);

    if (payload.action === "FOLLOW") {
      follows.set(socket.id, payload.socketId);
    } else if (payload.action === "UNFOLLOW") {
      follows.delete(socket.id);
    }

    // Compute who is being followed by whom
    const followedBy = new Map();
    for (const [follower, followed] of follows) {
      if (!followedBy.has(followed)) {
        followedBy.set(followed, []);
      }
      followedBy.get(followed).push(follower);
    }

    // Notify each user who is following them
    const sockets = Array.from(
      io.sockets.adapter.rooms.get(roomId) || [],
    );
    for (const sid of sockets) {
      io.to(sid).emit(
        "user-follow-room-change",
        followedBy.get(sid) || [],
      );
    }
  });

  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    for (const roomId of rooms) {
      // Clean up follow state
      if (roomFollows.has(roomId)) {
        const follows = roomFollows.get(roomId);
        follows.delete(socket.id);
        // Also remove anyone following this socket
        for (const [follower, followed] of follows) {
          if (followed === socket.id) {
            follows.delete(follower);
          }
        }
        if (follows.size === 0) {
          roomFollows.delete(roomId);
        }
      }

      // Broadcast updated user list (without this socket)
      const sockets = Array.from(
        io.sockets.adapter.rooms.get(roomId) || [],
      ).filter((id) => id !== socket.id);

      if (sockets.length > 0) {
        io.in(roomId).emit("room-user-change", sockets);
      } else {
        // Room is empty, clean up
        roomFollows.delete(roomId);
      }
    }
  });

  socket.on("disconnect", () => {
    socket.removeAllListeners();
  });
});

server.listen(PORT, () => {
  console.log(`Collaboration server running on port ${PORT}`);
});
