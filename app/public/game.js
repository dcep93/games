var socket;

var myIndex; // int
var game; // string
var room; // string
var states; // [{state: state, id: int, message: string, date: ?Date}]
var state;
var constants = {};
// {
// 	players: [], // [{name: string, state: object, time: int}]
// 	currentPlayer: undefined, // ?int
// 	lastState: undefined, // ?object
//. admin: undefined // int
// };

var tick = 100;

$(document).ready(function() {
	$('input[type=submit]').prop('disabled', false);
	$('#register_form').submit(apply);
	$('#lobby_host').click(prepare);
	setInterval(updateTime, tick);
});

function refresh() {
	location.href = location.href;
}

function leave() {
	socket.emit('room', {
		endpoint: 'leave',
		index: myIndex,
	});
}

function register(data) {
	if (myIndex !== undefined) {
		$.get('socket', undefined, function(data) {
			var obj = $.extend(true, { room: room, index: myIndex }, data);
			state.id++;
			if (myIndex === state.admin) obj.state = state;
			socket.emit('refresh', obj);
		});
	} else if (data.room !== undefined) {
		state = data.state;
		room = data.room;
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
	states = [];
	state = {
		players: [], // [{name: string, state: object}]
		currentPlayer: undefined, // ?int
		lastState: undefined, // ?string
		admin: undefined,
	};
}

function main() {
	initState(false);
	connectSocket();
}

function connectSocket() {
	$.holdReady(true);
	$.get('socket', undefined, function(data) {
		game = data.game;
		socket = io(':' + data.port, { secure: true });
		socket.on('connect', function() {
			$.holdReady(false);
			console.log('connected');
			socket.emit('register', data);
		});
		socket.on('reconnect', function() {
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
		alert('unknown endpoint: ' + endpoint);
	}
}

function apply() {
	socket.emit('room', {
		endpoint: 'register',
		room: $('#room_input').val(),
		name: $('#name_input').val(),
		game: game,
	});
	return false;
}

function room(data) {
	if (data.room === false) {
		alert('Room is closed');
		return;
	}
	if (data.room !== undefined) {
		if (data.admin !== undefined) state.admin = data.admin;
		myIndex = data.index;
		room = data.room;
	}
	if (data.name !== undefined) {
		if (myIndex === state.admin) {
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
		if (data.left !== state.admin && state.admin !== myIndex) return;
		var player = state.players[data.left];
		player.present = false;
		var message = 'left';
		if (state.admin !== myIndex) {
			message += ' and ' + me().name + ' became admin';
			me().present = true;
			state.admin = myIndex;
		}
		sendState(message, player.name);
	} else {
		console.log('unknown room', data);
	}
}

function lobby() {
	$('#lobby_players').empty();
	state.players.forEach(function(player, index) {
		$('<p>')
			.attr('index', index)
			.addClass('player')
			.text(player.name)
			.appendTo('#lobby_players');
	});
	show('#lobby');
	$(myIndex === state.admin ? '#lobby_host' : '#lobby_wait').show();
}

function kick() {
	var index = Number.parseInt($(this).attr('index'));
	if (index === myIndex) return;
	socket.emit('room', {
		endpoint: 'kick',
		index: index,
	});
}

function stateF(data) {
	if (
		data.state.id !== undefined &&
		states.length !== 0 &&
		data.state.id < states[0].id
	) {
		race(data);
		return;
	}
	state = data.state;
	state.id = data.id;
	logState({ id: data.id, player: data.player, message: data.message });

	if (state.currentPlayer === undefined) {
		lobby();
	} else {
		show('#game');
		var currentPlayer = current();
		if (currentPlayer !== undefined)
			$('#current_player').text(currentPlayer.name);
		basicUpdate();
		update();
	}
	if (state.admin === myIndex) $('.player').dblclick(kick);
}

function race(data) {
	var message;
	var invalid;
	if (data.id > state.id) {
		message = 'Race condition - invalid';
		invalid = true;
	} else {
		message = 'Race condition - slow server';
		states[0].invalid = true;
		invalid = false;
	}
	logState({
		state: data.state,
		id: data.id,
		player: data.player,
		message: message,
		invalid: invalid,
	});
	if (myIndex === state.admin) {
		for (var i = 0; i < states.length; i++) {
			var loadState = states[i];
			if (!loadState.invalid) {
				state = $.extend(true, loadState.state, { id: data.id });
				sendState(
					'Race recover: ' + loadState.message,
					loadState.player
				);
				break;
			}
		}
	}
}

function logState(obj) {
	states.unshift(obj);
	if (obj.state === undefined) obj.state = $.extend(true, {}, state);
	obj.date = new Date();
	var text = getLogText(obj);
	var log = $('<p>')
		.text(text)
		.prependTo('#log')
		.attr('data-id', obj.id);
	if (myIndex === state.admin) log.addClass('admin_log').click(restore);
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
	for (var i = 0; i < states.length; i++) {
		var loadState = states[i];
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

function show(identifier) {
	$('#page')
		.children()
		.not(identifier)
		.hide();
	$(identifier).show();
}

function isMyTurn(shouldAdvanceTurn) {
	if (myIndex === state.currentPlayer) {
		if (shouldAdvanceTurn) {
			advanceTurn();
		}
		return true;
	}
	return false;
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
};

// override me
function prepare() {
	state.currentPlayer = null;
	sendState('prepare');
}

function basicUpdate() {
	$('#door').text(state.closed ? 'Open' : 'Close');
	$('#turn_background')[isMyTurn(false) ? 'addClass' : 'removeClass'](
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
