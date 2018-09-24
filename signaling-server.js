// This is the signaling server for webRTC connection in the distance visit project

const express = require('express');
// const http = require('http').Server(app);
const socketIO = require('socket.io');
const path = require('path');

const PORT = process.env.PORT || 8443;
const ROBOT_TOKEN = process.env.ROBOT_TOKEN;
const CLIENT_TOKEN = process.env.CLIENT_TOKEN;
const INDEX = path.join(__dirname, 'index.html');
// const JSPATH = '/js/';

console.log(
  "Hello! I'm the signaling server for handling webRTC connection in distance visit project \n-----------------------------------\n-----------------------------------"
);

console.log(
  'ROBOT_TOKEN = ' + ROBOT_TOKEN + '\nCLIENT_TOKEN = ' + CLIENT_TOKEN
);

var allowCrossDomain = function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Content-Length, X-Requested-With'
  );

  // intercept OPTIONS method
  if ('OPTIONS' == req.method) {
    res.send(200);
  } else {
    next();
  }
};

server = express()
  .use(allowCrossDomain)
  // .use('/camera', (req, res) => {
  //   res.sendFile(path.join(__dirname, 'camera.html'));
  // })
  // .use('/js', (req, res) => {
  //   res.sendFile(path.join(__dirname, req.originalUrl));
  // })
  // .use('/lib', (req, res) => {
  //   res.sendFile(path.join(__dirname, req.originalUrl));
  // })
  // .use((req, res) => res.sendFile(INDEX))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const io = socketIO(server);

let robot = undefined;
const maxNumClients = 1;
let clients = {};

io.use((socket, next) => {
  let token = socket.handshake.query.token;
  if (token !== ROBOT_TOKEN && token !== CLIENT_TOKEN) {
    console.log('wrong token: ' + token);
    return next(new Error('authentication error'));
  }
  console.log('correct token');

  // if(clients.length >= 2){
  //   return next(new Error('Too many clients. Max is 2'));
  // }

  return next();
});

io.on('connection', function(socket) {
  let token = socket.handshake.query.token;
  console.log('a user connected with token: ' + token);
  console.log('socket id: ' + socket.id);

  if (token === ROBOT_TOKEN) {
    console.log('the robot just connected. Hurray!');
    robot = socket;

    robot.on('disconnect', () => {
      console.log('robot disconnected. Now cry!!');
      robot = undefined;
      if (clients) {
        Object.keys(clients).forEach(key =>
          clients[key].emit('robotConnected', false)
        );
      }
    });

    if (clients) {
      Object.keys(clients).forEach(key => {
        clients[key].emit('robotConnected', true);
        robot.emit('newClient', clients[key].id);
      });
    }
    // CLIENT
  } else if (!clients[socket.id]) {
    //Check for max limit
    if (Object.keys(clients).length >= maxNumClients) {
      socket.send('too many clients. You were rejected');
      console.log('too many clients. Rejecting the client');
      socket.disconnect();
      return;
    }
    socket.on('disconnect', () => {
      console.log('client disconnected: ' + socket.id);
      // let index = clients.indexOf(socket);
      // clients.splice(index, 1);
      if (robot) {
        robot.emit('removeClient', socket.id);
      }
      delete clients[socket.id];
    });

    clients[socket.id] = socket;
    if (robot) {
      robot.emit('newClient', socket.id);
      socket.emit('robotConnected', true);
    }
  } else {
    console.log(
      "Weeeeeird! The socket was already in the client list. Didn't add it."
    );
  }

  socket.send('welcome');

  //TODO: make sure we are not fucking up context and are referring to a 'volatile' socket.
  socket.on('message', data => {
    // console.log(socket);
    console.log(data);
    // console.log('message from ' + from + ' with ' + data);
    Object.keys(clients).forEach(key => {
      if (socket !== clients[key]) {
        clients[key].send(data);
      }
    });
  });

  socket.on('offer', data => {
    let msg;
    if ((msg = JSON.parse(data))) {
    // if ((msg = necromancer.resurrect(data))) {
      console.log('RTC offer from ' + socket.id);
      // console.log(msg);
      if (msg.targetSocketId && msg.offer) {
        console.log('sending offer to client: ' + msg.targetSocketId);
        clients[msg.targetSocketId].emit('offer', data);
      } else {
        console.error('Invalid offer received');
      }
    }
  });

  socket.on('answer', data => {
    let msg;
    if ((msg = JSON.parse(data))) {
    // if ((msg = necromancer.resurrect(data))) {
      console.log('RTC answer from ' + socket.id);
      // console.log(msg);
      if (msg.answer) {
        msg.fromSocketId = socket.id;
        robot.emit(
          'answer',
          JSON.stringify(msg)
          // necromancer.stringify(msg)
        );
      } else {
        console.error('Invalid answer received');
      }
    }
  });

  socket.on('ice', data => {
    let msg;
    if ((msg = JSON.parse(data))) {
      console.log('RTC ICE candidate from ' + socket.id);
      // console.log(msg)
      // console.log(if(msg.candidate){true;}else{true;});
      if (msg.targetSocketId && msg.candidate && clients[msg.targetSocketId]) {
        console.log('with target: ' + msg.targetSocketId);
        clients[msg.targetSocketId].emit('ice', data);
      } else if (msg.candidate) {
        console.log('without target (sending to robot)');
        robot.emit(
          'ice',
          JSON.stringify({ fromSocket: socket.id, candidate: msg.candidate })
        );
      } else {
        console.error('Invalid ice received!');
      }
    }
  });

  //TODO: Handle signaling better! With routing between robot and clients
  socket.on('signalingMessage', data => {
    // console.log(socket);
    console.log(data);
    // console.log('message from ' + from + ' with ' + data);
    clients.forEach(element => {
      if (socket !== element) {
        element.emit('signalingMessage', data);
      }
    });
    if (socket !== robot) {
      robot.emit('signalingMessage', data);
    }
  });
});
