var server = require('http').createServer(handler);
var io = require('socket.io')(server, {
  // ...
});
var fs = require('fs');

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


io.on("connection", (socket) => {
	console.log('connection', socket.id);
	console.log('connection', socket.handshake.auth);
	socket.join(10);
	console.log('connection', socket.id + ' joined 10');

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
		io.to(10).emit('captureImage', { data });
	});

	socket.on('returnImage', function(data) {
		io.to(10).emit('returnImage', { data });
	});

});
