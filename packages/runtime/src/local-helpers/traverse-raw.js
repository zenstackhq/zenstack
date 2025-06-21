/* eslint-disable */
'use strict';

function walk(root, cb) {
	var path = [];
	var parents = [];

	return (function walker(node_) {
		var node = node_;

		var keepGoing = true;

		var state = {
			node: node,
			node_: node_,
			path: [].concat(path),
			parent: parents[parents.length - 1],
			parents: parents,
			key: path[path.length - 1],
			isRoot: path.length === 0,
			circular: null,
			update: function (x) {
				if (!state.isRoot) {
					state.parent.node[state.key] = x;
				}
				state.node = x;
				keepGoing = false;
			},
			keys: null,
		};

		function updateState() {
			if (typeof state.node === 'object' && state.node !== null) {
				if (!state.keys || state.node_ !== state.node) {
					state.keys = Object.keys(state.node);
				}

				state.isLeaf = state.keys.length === 0;

				for (var i = 0; i < parents.length; i++) {
					if (parents[i].node_ === node_) {
						state.circular = parents[i];
						break; // eslint-disable-line no-restricted-syntax
					}
				}
			} else {
				state.isLeaf = true;
				state.keys = null;
			}

			state.notLeaf = !state.isLeaf;
			state.notRoot = !state.isRoot;
		}

		updateState();

		cb.call(state, state.node);

		if (!keepGoing) { return state; }

		if (
			typeof state.node === 'object'
			&& state.node !== null
			&& !state.circular
		) {
			parents[parents.length] = state;

			updateState();

			state.keys.forEach(function (key, i) {
				path[path.length] = (key);

				var child = walker(state.node[key]);

				child.isLast = i === state.keys.length - 1;
				child.isFirst = i === 0;

				path.pop();
			});
			parents.pop();
		}

		return state;
	}(root)).node;
}

function Traverse(obj) {
	this.value = obj;
}

Traverse.prototype.map = function (cb) {
	return walk(this.value, cb);
};

Traverse.prototype.forEach = function (cb) {
	this.value = walk(this.value, cb);
	return this.value;
};

function traverse(obj) {
	return new Traverse(obj);
}

module.exports = traverse;
