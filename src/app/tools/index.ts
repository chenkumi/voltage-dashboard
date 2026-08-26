import conversationLog from "./conversationLog";
import cURL from "./cURL";
import datetime from "./datetime";
import fileEdit from "./fileEdit";
import globSearch from "./fileGlobSearch";
import grepSearch from "./fileGrepSearch";
import fileRead from "./fileRead";
import fileWrite from "./fileWrite";
import runScript from "./runScript";
import loadDocument from "./loadDocument";
import loadSkill from "./loadSkill";
import loadTools from "./loadTools";
import { dynamicToolRegistry } from "./registry";
import runSkillScript from "./runSkillScript";
import webDownload from "./webDownload";
import webReader from "./webReader";
import webSearch from "./webSearch";

const DynamicTools = [
    globSearch,
    grepSearch,
    webReader,
    webDownload,
    datetime,
    // random,
    fileRead,
    fileEdit,
    fileWrite,
    cURL,
];

DynamicTools.forEach(tool => {
    dynamicToolRegistry.register(tool);
});

const PrimaryTools = [
    loadTools,
    loadSkill,
    loadDocument,
    runSkillScript,
    conversationLog,
    webSearch,
    runScript,
];

export const javascriptTools = [
    globSearch,
    grepSearch,
    fileRead,
    fileEdit,
    fileWrite,
];


export { DynamicTools, PrimaryTools };
export default PrimaryTools;
