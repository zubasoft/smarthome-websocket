var server = require('http').createServer(handler);
var io = require('socket.io')(server, {
  // ...
});
var login = require('./framework/Login.js').login;
var network = require('./framework/Network.js').network;
var auth = require('./framework/Auth.js').auth;
var fs = require('fs');

const deviceID = 'zs_websocket_server';

server.listen(3000);

if (typeof(PhusionPassenger) == 'undefined') {
	console.log('Socket.io demo listening on http://127.0.0.1:' + server.address().port);
}

/**
 * Given a request, looks up the static file that belongs to it.
 *
 * This function is not written with security in mind. It was
 * written quickly for this demo. Do not use this function's code
 * in production.
 */
function lookupFile(req) {
	var name = '/index.html';
	/*if (req.url == '/') {
		name = '/index.html';
	} else {
		name = req.url;
	}*/
	return __dirname + '/public' + name;
}

/**
 * The handler function for the HTTP server. It just serves static files.
 *
 * Note that this entire handler function does not get called when the demo app
 * is run under Phusion Passenger. This is because Phusion Passenger takes care
 * of serving all static assets through a real web server (Nginx or Apache).
 */
function handler(req, res) {
	var filename = lookupFile(req);
	fs.readFile(filename, function (err, data) {
		if (err) {
			res.writeHead(500);
			return res.end('Error loading file');
		} else {
			res.writeHead(200);
			res.end(data);
		}
	});
}

function isUnauthorized(event) {
	return true;
}

function getRoomID(s, d) {
	return new Promise((resolve, reject) => {
		console.log('auth', auth.getSessionID());

		network.ajax({
			url    : 'user/getRoomID',
			device_id: deviceID,
			data   : {
				session_id: s,
				device_id: d
			}
		}).then((json) => {
			if(json.room_id) {
				resolve(json.room_id);
			}
		});
	});
}


io.on("connection", (socket) => {
	console.log(socket.id);
	login(deviceID).then((json) => {
		getRoomID(socket.handshake.auth.s, socket.handshake.auth.d).then((roomID) => {
			socket.join(roomID);
			console.log('connection', socket.id + ' joined ' + roomID);
		});
	});

	socket.use(([event, ...args], next) => {
		console.log(socket.handshake.auth);
		console.log(args, event);

		if (isUnauthorized(event) === false) {
			console.log("unauthorized event");
			return next(new Error("unauthorized event"));
		}

		next();
	});

	socket.on("error", (err) => {
		if (err && err.message === "unauthorized event") {
			socket.disconnect();
		}
	});

	socket.on('getImage', function(data) {
		getRoomID(socket.handshake.auth.s, socket.handshake.auth.d).then((roomID) => {
			io.to(roomID).emit('captureImage', { data });
		});
	});

	socket.on('returnImage', function(data) {
		getRoomID(socket.handshake.auth.s, socket.handshake.auth.d).then((roomID) => {
			io.to(roomID).emit('returnImage', { data });
		});
	});

});
