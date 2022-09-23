"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const langium_1 = require("langium");
const node_1 = require("vscode-languageserver/node");
const zmodel_module_1 = require("./zmodel-module");
// Create a connection to the client
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Inject the shared services and language-specific services
const { shared } = (0, zmodel_module_1.createZModelServices)({ connection });
// Start the language server with the shared services
(0, langium_1.startLanguageServer)(shared);
//# sourceMappingURL=main.js.map