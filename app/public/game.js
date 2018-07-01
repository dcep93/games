var socket;

var myIndex; // int
var adminIndex; // int
var gameName; // string
var roomName; // string
var stateHistory; // [{state: state, id: int, message: string, date: ?Date}]
var constants = {};
var state;
// {
// 	players: [], // [{name: string, state: object, time: int}]
// 	currentPlayer: undefined, // ?int
// };
var debug;

var tick = 100;

$(document).ready(function() {
	$('#door').click(door);
	$('#leave').click(leave);
	$('#pull').click(function() { socket.emit('sg_pull', {}) });
	$('#push').click(push);
	$('input[type=submit]').prop('disabled', false);
	$('#register_form').submit(apply);
	$('#lobby_host').click(prepare);
	setInterval(updateTime, tick);
});

function refresh() {
	location.reload(true);
}

function leave() {
	socket.emit('sg_room', {
		endpoint: 'leave',
	});
}

function isAdmin(playerIndex) {
	if (playerIndex === undefined) playerIndex = myIndex;
	return playerIndex === adminIndex;
}

function register(data) {
	if (myIndex !== undefined) {
		$.get('socket', undefined, function(data) {
			var obj = $.extend(true, { room: roomName, index: myIndex }, data);
			state.id++;
			if (isAdmin()) obj.state = state;
			socket.emit('sg_refresh', obj);
		});
	} else if (data.room !== undefined) {
		state = data.state;
		roomName = data.room;
		adminIndex = data.admin;
		myIndex = data.index;
		if (data.original !== undefined) {
			logState({
				state: data.original,
				id: data.original.id,
				message: 'server restart at ' + data.updated,
			});
		}
		state.id = data.id;
		sendState('rejoined');
	} else {
		initState(data);
	}
}

function initState(data) {
	if (data) show('#welcome');
	$('#log').empty();
	myIndex = undefined;
	stateHistory = [];
	state = {
		players: [], // [{name: string, state: object}]
		currentPlayer: undefined, // ?int
		lastState: undefined, // ?string
	};
}

function show(identifier) {
	$(identifier)
		.siblings()
		.hide();
	$(identifier).show();
}

function main() {
	initState(false);
	connectSocket();
}

function connectSocket() {
	$.holdReady(true);
	$.get('socket', undefined, function(data) {
		gameName = data.game;
		socket = io(':' + data.port, { secure: true });
		socket.on('connect', function() {
			$.holdReady(false);
			console.log('connected');
			socket.emit('sg_register', data);
		});
		socket.on('sg_reconnect', function() {
			console.log('reconnected');
		});
		socket.on('message', receive);
	});
}

function me(stateCopy) {
	if (stateCopy === undefined) stateCopy = state;
	return stateCopy.players[myIndex];
}

function current(stateCopy) {
	if (stateCopy === undefined) stateCopy = state;
	return stateCopy.players[stateCopy.currentPlayer];
}

function sendState(message, player, extra) {
	if (player === undefined) player = me().name;
	socket.send(
		$.extend(
			true,
			{
				endpoint: 'state',
				state: state,
				player: player,
				message: message,
			},
			extra
		)
	);
}

function receive(data) {
	var endpoint = data.endpoint;
	var f = endpoints[endpoint];
	if (f) {
		console.log(endpoint, data.id);
		f(data);
	} else {
		debug = $.extend(null, {}, data);
		alert('unknown endpoint: ' + endpoint);
	}
}

function apply() {
	socket.emit('sg_room', {
		endpoint: 'register',
		room: $('#room_input').val(),
		name: $('#name_input').val(),
		game: gameName,
	});
	return false;
}

function room(data) {
	if (data.room === false) {
		alert('Room is closed');
		return;
	}
	if (data.room !== undefined) {
		if (data.admin !== undefined) adminIndex = data.admin;
		myIndex = data.index;
		roomName = data.room;
	}
	if (data.name !== undefined) {
		if (isAdmin()) {
			if (state.players[data.index] !== undefined) {
				sendState('rejoined', data.name);
			} else {
				var player = {
					name: data.name,
					present: state.currentPlayer === undefined,
					time: 0,
					state: newState(),
				};
				state.players[data.index] = player;
				sendState('joined', data.name);
			}
		}
	} else if (data.kicked !== undefined) {
		var player = state.players[data.kicked];
		player.present = null;
		if (data.kicked === state.currentPlayer) advanceTurn();
		sendState('kicked [' + player.name + ']');
	} else if (data.left !== undefined) {
		var player = state.players[data.left];
		player.present = false;
		var message = 'left';
		if (!isAdmin()) {
			message += ' and ' + me().name + ' became admin';
			me().present = true;
		}
		sendState(message, player.name);
	} else {
		console.log('unknown room', data);
	}
}

function kick() {
	var index = $(this).index();
	if (index === myIndex) return;
	var player = state.players[index];
	if (confirm('Are you sure you want to kick ' + player.name + '?'))
	socket.emit('sg_room', {
		endpoint: 'kick',
		index: index,
	});
}

function lobby() {
	$('#global_controls').appendTo('#lobby_controls_div');
	show('#lobby');
	show(isAdmin() ? '#lobby_host' : '#lobby_wait');
}

function pull(data) {
	if (stateHistory.length === 0) {
		data.message = 'pulled from scratch';
	} else {
		var lastId = stateHistory[0].id;
		data.message = 'pull [' + lastId + '] - ';
		if (data.id > lastId) {
			data.message += 'fixed';
		} else if (data.id < lastId) {
			debug = $.extend(null, {}, data);
			data.message += 'uh thats weird...';
		} else {
			return alert('already up to date');
		}
	}
	stateHelper(data);
}

function push() {
	sendState('push');
}

function stateF(data) {
	if (
		data.state.id !== undefined &&
		stateHistory.length !== 0 &&
		data.state.id < stateHistory[0].id
	) {
		if (isAdmin()) race(data);
		return;
	}
	stateHelper(data);
}

function stateHelper(data) {
	show('#room_container');
	adminIndex = data.admin;
	state = data.state;
	state.id = data.id;
	logState({ id: data.id, player: data.player, message: data.message });

	$('#players').empty();
	state.players.forEach(function(player, index) {
		if (player.present !== null) {
			$('<p>')
				.attr('index', index)
				.addClass('player')
				.text(player.name)
				.appendTo('#players');
		}
	});
	if (isAdmin()) $('.player').click(kick);

	basicUpdate();

	if (state.currentPlayer === undefined) return lobby();
	$('#global_controls').appendTo('#game_controls_div');
	show('#game');
	var currentPlayer = current();
	if (currentPlayer !== undefined)
		$('#current_player').text(currentPlayer.name);
	update();
}

function race(data) {
	var message;
	var invalid;
	if (data.id > state.id) {
		message = 'Race condition - invalid';
		invalid = true;
	} else {
		message = 'Race condition - slow server';
		stateHistory[0].invalid = true;
		invalid = false;
	}
	logState({
		state: data.state,
		id: data.id,
		player: data.player,
		message: message,
		invalid: invalid,
	});
	for (var i = 0; i < stateHistory.length; i++) {
		var loadState = stateHistory[i];
		if (!loadState.invalid) {
			state = $.extend(true, loadState.state, { id: data.id });
			sendState(
				'Race recover: ' + loadState.message,
				loadState.player
			);
			return;
		}
	}
	alert('Race condition, but no valid state available. This should never happen. Seek shelter.');
}

function logState(obj) {
	stateHistory.unshift(obj);
	if (obj.state === undefined) obj.state = $.extend(true, {}, state);
	obj.date = new Date();
	var text = getLogText(obj);
	var log = $('<p>')
		.text(text)
		.prependTo('#log')
		.attr('data-id', obj.id);
	if (isAdmin()) log.addClass('admin_log').click(restore);
}

function getLogText(obj) {
	var text = '(' + obj.id + ') ' + obj.date.toLocaleTimeString() + ' ';
	if (obj.player !== undefined) text += '[' + obj.player + '] ';
	text += obj.message;
	return text;
}

function restore() {
	var id = $(this).attr('data-id');
	if (id === undefined) return;
	restoreHelper(Number.parseInt(id));
}

function restoreHelper(id) {
	for (var i = 0; i < stateHistory.length; i++) {
		var loadState = stateHistory[i];
		if (loadState.id === id) {
			state = $.extend(true, loadState.state, { id: state.id });
			sendState(
				'restored to [' + getLogText(loadState) + ']',
				undefined,
				{ locked: true }
			);
			return;
		}
	}
	alert('could not find id ' + id);
}

function reconnect(data) {
	console.log(data);
	myIndex = data.index;
	state = data.state;
	sendState('reconnect');
}

function isMyTurn() {
	if (state.currentPlayer === undefined) {
		return isAdmin();
	}
	return myIndex === state.currentPlayer;
}

function advanceTurn() {
	state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
}

function shuffleArray(array) {
	for (let i = array.length - 1; i > 0; i--) {
		let j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}

function getJSONs(jsons) {
	$.holdReady(true);
	constants.toLoad = jsons.length;
	for (var i = 0; i < jsons.length; i++) {
		var json = jsons[i];
		(function(json) {
			$.getJSON(json.path, undefined, function(data) {
				constants[json.name] = data;
				if (--constants.toLoad === 0) {
					delete constants.toLoad;
					$.holdReady(false);
				}
			});
		})(json);
	}
}

function door() {
	state.closed = !state.closed;
	sendState(state.closed ? 'closed room' : 'opened room');
}

var endpoints = {
	register: register,
	initState: initState,
	room: room,
	state: stateF,
	reconnect: reconnect,
	refresh: refresh,
	alert: alertF,
	pull: pull,
};

function alertF(data) {
	alert(data.alert);
}

// override me
function prepare() {
	state.currentPlayer = null;
	sendState('prepare');
}

function basicUpdate() {
	if (myIndex >= state.players.length) refresh();
	$('#door').text(state.closed ? 'Open' : 'Close');
	$('#turn_background')[isMyTurn() ? 'addClass' : 'removeClass'](
		'active_background'
	);
}

function timeToString(time) {
	var minutes = Math.floor(time / 1000 / 60);
	var seconds = Math.floor(time / 1000) % 60;
	if (seconds < 10) seconds = '0' + seconds;
	return minutes + ':' + seconds;
}

function updateTime(index, forTick) {
	var player = current();
	if (player !== undefined) {
		player.time += tick;
		$('.player_time')
			.eq(state.currentPlayer)
			.text(timeToString(player.time));
	}
}

// override me
function update() {}

// override me
function newState() {
	return {};
}

main();
