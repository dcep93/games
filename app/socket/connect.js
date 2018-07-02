var crypt = require('./crypt');

var emptyRoomTime = 30 * 60 * 1000;

var rooms = {}; // {string: {string: {admin: int, state: object, nextId: int, clients: {int: {index: int, client: ?Client}}}}}
var clientToRoom = {}; // int: {room: string, game: string}
var updated = new Date();

function getRoom(roomInfo) {
	if (roomInfo === undefined) return undefined;
	return getRoomGame(roomInfo.game)[roomInfo.room];
}

function setRoom(roomInfo, room) {
	getRoomGame(roomInfo.game)[roomInfo.room] = room;
}

function getRoomGame(game) {
	var roomGame = rooms[game];
	if (roomGame === undefined) {
		roomGame = {};
		rooms[game] = roomGame;
	}
	return roomGame;
}

function connect(client) {
	var clientId; // int
	var roomInfo; // {room: string, game: string}
	var roomString; // string
	client.on('sg_register', function(data) {
		clientId =
			data.iter === crypt.iter ? crypt.decrypt(data.id) : undefined;
		roomInfo = clientToRoom[clientId];
		var room = getRoom(roomInfo);
		console.log('register', clientId, roomInfo, data, room !== undefined);
		if (room !== undefined && room.state !== undefined) {
			roomString = JSON.stringify(roomInfo);
			var clientO = room.clients[clientId];
			if (clientO !== undefined) {
				clientO.client = client;
				client.join(roomString);
				client.send({
					endpoint: 'register',
					room: roomInfo.room,
					admin: room.admin,
					state: room.state,
					index: clientO.index,
					original: room.original,
					updated: updated,
				});
				return;
			}
		}
		client.send({ endpoint: 'register' });
	});
	client.on('disconnect', function() {
		console.log('disconnect', clientId, roomInfo);
		if (roomInfo !== undefined) leave(false);
	});
	client.on('reconnect', function() {
		var room = getRoom(roomInfo);
		console.log('reconnect', clientId, roomInfo, room !== undefined);
		if (room !== undefined) {
			var clientO = room.clients[clientId];
			if (clientO !== undefined) {
				var admin = getAdmin(room);
				if (admin.client === undefined) room.admin = clientO.index;
				clientO.client = client;
				client.join(roomString);
				client.send({
					endpoint: 'reconnect',
					state: room.state,
					index: room.clients[clientId].index,
					admin: room.admin,
				});
				return;
			}
		}
		client.send({ endpoint: 'refresh' });
	});
	function getAdmin(room) {
		for (var id in room.clients) {
			var clientO = room.clients[id];
			if (clientO.index === room.admin) {
				return clientO;
			}
		}
	}
	function leave(forLeave) {
		var room = getRoom(roomInfo);
		if (room === undefined) return console.log('undefined room', roomInfo);
		var c = kick(clientId, forLeave);
		if (c === undefined) return;
		setTimeout(function() {
			checkEmptyRoom(roomInfo);
		}, emptyRoomTime);
		if (Object.keys(room.clients).length === 1) {
			room.state.players[room.admin].present = false;
			return;
		}
		var leaveClient;
		if (c.index === room.admin) {
			for (var adminId in room.clients) {
				var clientO = room.clients[adminId];
				if (clientO !== undefined && clientO.client !== undefined) {
					room.admin = clientO.index;
					leaveClient = clientO.client;
					break;
				}
			}
		} else {
			for (var adminId in room.clients) {
				var clientO = room.clients[adminId];
				if (clientO !== undefined && clientO.index === room.admin) {
					leaveClient = clientO.client;
					break;
				}
			}
		}
		if (leaveClient === undefined) return false;
		leaveClient.send({ endpoint: 'room', left: c.index });
	}
	function kick(kickId, forKick) {
		var clientO = getRoom(roomInfo).clients[kickId];
		if (clientO === undefined) return console.log('undefined client', kickId);
		if (forKick) {
			console.log('kick', clientId, roomInfo);
			delete clientToRoom[kickId];
			if (clientO.client !== undefined) {
				clientO.client.send({ endpoint: 'initState' });
				clientO.client.leave(roomString);
			}
		}
		clientO.client = undefined;
		return clientO;
	}
	client.on('sg_room', function(data) {
		if (clientId === undefined) return console.log('undefined clientId');
		if (data.endpoint === 'register') {
			if (clientToRoom[clientId] !== undefined) return console.log('already registered', clientId, clientToRoom[clientId]);
			if (data.room === undefined || data.game === undefined) return console.log('bad data', data);
			var room = getRoom(data);
			if (room !== undefined && room.state.closed) return client.send({ endpoint: 'room', room: false });
			roomInfo = { room: data.room, game: data.game };
			console.log('room_register', clientId);
			clientToRoom[clientId] = roomInfo;
			roomString = JSON.stringify(roomInfo);
			var obj = {
				endpoint: 'room',
				name: data.name,
				room: data.room,
			};
			if (!room) {
				obj.index = 0;
				room = {
					nextId: 0,
					clients: {},
					admin: obj.index,
					state: {},
				};
				setRoom(roomInfo, room);
			} else {
				var clientO = room.clients[clientId];
				if (clientO !== undefined) {
					obj.index = clientO.index;
				} else {
					obj.index = Object.keys(room.clients).length;
				}
				var admin = getAdmin(room);
				if (admin.client === undefined) {
					room.admin = obj.index;
					obj.state = room.state;
				}
			}
			obj.admin = room.admin;
			room.clients[clientId] = {
				index: obj.index,
				client: client,
			};
			client.join(roomString);
			client.send(obj);
			client.to(roomString).broadcast.emit('message', {
				endpoint: obj.endpoint,
				name: obj.name,
				index: obj.index,
			});
		} else if (data.endpoint === 'kick') {
			var room = getRoom(roomInfo);
			if (room === undefined) return console.log('no room', roomInfo);
			var kickId;
			for (var id in room.clients) {
				var kickClientO = room.clients[id];
				if (kickClientO.index === data.index) {
					kickId = id;
				}
			}
			if (kickId === undefined) return console.log('no kick matched', data);
			var admin = getAdmin(room);
			if (room.clients[clientId].index !== admin.index) return console.log('not admin', clientId);
			kick(kickId, true);
			client.send({
				endpoint: 'room',
				kicked: data.index,
			});
		} else if (data.endpoint === 'leave') {
			leave(true);
		} else {
			console.log('room', 'endpoint', data);
		}
	});
	client.on('sg_refresh', function(data) {
		if (data.iter !== crypt.iter) return;
		if (data.game === undefined || data.room === undefined) return;
		roomInfo = { game: data.game, room: data.room };
		var room = getRoom(roomInfo);
		if (room === undefined) {
			room = { clients: {}, admin: data.index, state: {} };
			getRoomGame(data.game)[data.room] = room;
		}
		clientId = crypt.decrypt(data.id);
		if (clientId === undefined) return;
		console.log('refresh', clientId);
		clientToRoom[clientId] = roomInfo;
		room.clients[clientId] = { index: data.index };
		if (data.state !== undefined) {
			room.original = data.state;
			room.state = data.state;
			room.nextId = data.state.id + 1;
			console.log('refresh', clientId, roomInfo);
		}
		client.send({ endpoint: 'refresh' });
	});
	client.on('message', function(data) {
		var room = getRoom(roomInfo);
		if (room !== undefined) {
			data.admin = room.admin;
			data.id = ++room.nextId;
			client.to(roomString).broadcast.emit('message', data);
			client.send(data);
			if (data.state) room.state = data.state;
		}
	});
	client.on('sg_pull', function(data) {
		var room = getRoom(roomInfo);
		if (room !== undefined) {
			var state = { endpoint: 'pull', admin: room.admin, id: room.nextId, state: room.state };
			client.send(state);
		}
	});
}

function checkEmptyRoom(roomInfo) {
	var roomGame = getRoomGame(roomInfo.game);
	if (roomGame === undefined) return console.log('undefined roomGame', roomInfo);
	var room = roomGame[roomInfo.room];
	if (room === undefined) return console.log('undefined room', roomInfo);
	var clients = room.clients;
	for (var otherClientId in clients) {
		var clientO = clients[otherClientId];
		if (clientO !== undefined && clientO.client !== undefined) return;
	}
	console.log('ending room', roomInfo);
	for (var otherClientId in clients) {
		if (clientToRoom[otherClientId] === roomInfo)
			delete clientToRoom[otherClientId];
	}
	delete roomGame[roomInfo.room];
}

module.exports = connect;
