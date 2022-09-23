"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateJavaScript = void 0;
const fs_1 = __importDefault(require("fs"));
const langium_1 = require("langium");
const path_1 = __importDefault(require("path"));
const cli_util_1 = require("./cli-util");
function generateJavaScript(model, filePath, destination) {
    const data = (0, cli_util_1.extractDestinationAndName)(filePath, destination);
    const generatedFilePath = `${path_1.default.join(data.destination, data.name)}.js`;
    const fileNode = new langium_1.CompositeGeneratorNode();
    fileNode.append('"use strict";', langium_1.NL, langium_1.NL);
    // model.greetings.forEach(greeting => fileNode.append(`console.log('Hello, ${greeting.person.ref?.name}!');`, NL));
    if (!fs_1.default.existsSync(data.destination)) {
        fs_1.default.mkdirSync(data.destination, { recursive: true });
    }
    fs_1.default.writeFileSync(generatedFilePath, (0, langium_1.processGeneratorNode)(fileNode));
    return generatedFilePath;
}
exports.generateJavaScript = generateJavaScript;
//# sourceMappingURL=generator.js.map