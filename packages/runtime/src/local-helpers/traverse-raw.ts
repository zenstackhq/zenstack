/* eslint-disable */
'use strict';

function walk(root, cb) {
	const path = [];
	const parents = [];

	function walker(node) {
		let keepGoing = true;

		const state = {
			node: node,
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
		};

		if (typeof state.node === 'object' && state.node !== null) {
			for (let i = 0; i < parents.length; i++) {
				if (parents[i].node === state.node) {
					state.circular = parents[i];
					break;
				}
			}
		}

		cb.call(state, state.node);

		if (!keepGoing) { return state; }

		if (
			typeof state.node === 'object'
			&& state.node !== null
			&& !state.circular
		) {
			parents[parents.length] = state;

			Object.keys(state.node).forEach((key) => {
				path[path.length] = key;

				walker(state.node[key]);

				path.pop();
			});

			parents.pop();
		}

		return state;
	}

	return walker(root).node;
}

function traverse(obj, cb) {
	return walk(obj, cb);
}

module.exports = traverse;
