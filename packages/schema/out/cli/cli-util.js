"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDestinationAndName = exports.extractAstNode = exports.extractDocument = void 0;
const colors_1 = __importDefault(require("colors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const vscode_uri_1 = require("vscode-uri");
function extractDocument(fileName, services) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const extensions = services.LanguageMetaData.fileExtensions;
        if (!extensions.includes(path_1.default.extname(fileName))) {
            console.error(colors_1.default.yellow(`Please choose a file with one of these extensions: ${extensions}.`));
            process.exit(1);
        }
        if (!fs_1.default.existsSync(fileName)) {
            console.error(colors_1.default.red(`File ${fileName} does not exist.`));
            process.exit(1);
        }
        const document = services.shared.workspace.LangiumDocuments.getOrCreateDocument(vscode_uri_1.URI.file(path_1.default.resolve(fileName)));
        yield services.shared.workspace.DocumentBuilder.build([document], { validationChecks: 'all' });
        const validationErrors = ((_a = document.diagnostics) !== null && _a !== void 0 ? _a : []).filter(e => e.severity === 1);
        if (validationErrors.length > 0) {
            console.error(colors_1.default.red('There are validation errors:'));
            for (const validationError of validationErrors) {
                console.error(colors_1.default.red(`line ${validationError.range.start.line + 1}: ${validationError.message} [${document.textDocument.getText(validationError.range)}]`));
            }
            process.exit(1);
        }
        return document;
    });
}
exports.extractDocument = extractDocument;
function extractAstNode(fileName, services) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        return (_a = (yield extractDocument(fileName, services)).parseResult) === null || _a === void 0 ? void 0 : _a.value;
    });
}
exports.extractAstNode = extractAstNode;
function extractDestinationAndName(filePath, destination) {
    filePath = filePath.replace(/\..*$/, '').replace(/[.-]/g, '');
    return {
        destination: destination !== null && destination !== void 0 ? destination : path_1.default.join(path_1.default.dirname(filePath), 'generated'),
        name: path_1.default.basename(filePath)
    };
}
exports.extractDestinationAndName = extractDestinationAndName;
//# sourceMappingURL=cli-util.js.map