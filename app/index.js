var log = console.log;
console.log = function() {
	var arr = Array.from(arguments);
	var d = new Date();
	var dateString = `${d.toDateString()} ${d.toTimeString().split(' ')[0]}`;
	arr.unshift(dateString);
	log(...arr);
};

var express = require('express');
var path = require('path');

var socket_games = require('./socket_games');

var app = express();

app.set('views', path.join(__dirname, 'views'));

app.use(socket_games);

var port = process.env.PORT || 8080;

app.listen(port, function() {
	console.log(`listening on port ${port}`);
});
