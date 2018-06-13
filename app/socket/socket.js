var express = require('express');
var cookieSession = require('cookie-session');
var socket = require('socket.io');
var fs = require('fs');
var http = require('http');
var https = require('https');
var path = require('path');

var connect = require('./connect');
var crypt = require('./crypt');

var passphrase;
try {
	passphrase = fs
		.readFileSync(path.join(__dirname, 'cert', 'passphrase.txt'), 'utf8')
		.trim();
} catch (e) {
	console.log('failed passphrase:', e.message);
}

var port = 2096;

var app = express();

var server;
if (passphrase !== undefined) {
	try {
		// $ openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 100
		var creds = {
			key: fs.readFileSync(path.join(__dirname, 'cert', 'key.pem')),
			cert: fs.readFileSync(path.join(__dirname, 'cert', 'cert.pem')),
			passphrase: passphrase,
		};
		server = https.createServer(creds, app);
	} catch (e) {
		console.log('failed https:', e.message);
	}
}
if (server === undefined) {
	server = http.createServer(app);
}

var io = socket.listen(server);

io.on('connection', connect);

server.listen(port, function() {
	console.log(`socket listening on port ${port}`);
});

var router = express.Router();

router.use(cookieSession({ secret: new Date().toString() }));

var nextId = 0;
router.register = function(req, res, game) {
	if (!req.session[game]) req.session[game] = ++nextId;
	var id = crypt.encrypt(req.session[game].toString());
	res.send({ port: port, game: game, id: id, iter: crypt.iter });
};

router.passphrase = passphrase;

module.exports = router;
