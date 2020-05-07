import * as abaplint from "@abaplint/core";
import {ABAPObject, INode, SyntaxLogic, Version} from "@abaplint/core";
import {TokenNode} from "@abaplint/core/build/src/abap/nodes";
import * as abapMonaco from "@abaplint/monaco";
import * as cytoscape from "cytoscape";
import * as dagre from "cytoscape-dagre";

import * as monaco from "monaco-editor";
import Split from "split-grid";

import "./style.less";

const nodeHtmlLabel = require("cytoscape-node-html-label");

cytoscape.use(dagre);
nodeHtmlLabel(cytoscape);

const registry = new abaplint.Registry(new abaplint.Config(JSON.stringify({
    global: {
        files: "/**/*.*",
        skipGeneratedGatewayClasses: true,
        skipGeneratedPersistentClasses: true,
        skipGeneratedFunctionGroups: true
    },
    syntax: {
        version: Version.v702,
        errorNamespace: "."
    },
    rules: {
        when_others_last: true,
        avoid_use: {
            define: true,
            execSQL: true,
            kernelCall: true,
            communication: true,
            systemCall: true,
            break: true,
            statics: true
        },
        parser_error: true,
        unknown_types: true,
        check_syntax: true,
        functional_writing: true,
        obsolete_statement: {
            refresh: true,
            compute: true,
            requested: true,
            setExtended: true,
            occurs: true
        }
    }
})));

abapMonaco.registerABAP(registry);

const filename = "file:///zdummy.prog.abap";

const model = monaco.editor.createModel(
    "WRITE 'Hello World'.",
    "abap",
    monaco.Uri.parse(filename)
);

registry.addFile(new abaplint.MemoryFile(filename, ""));

Split({
    columnGutters: [
        {
            track: 1,
            element: document.getElementById("gutter")
        }
    ]
});

const editor = monaco.editor.create(document.getElementById("editor"), {
    model: model,
    theme: "vs-dark",
    minimap: {
        enabled: false
    }
});

const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
        if (mutation.attributeName === "style") {
            editor.layout();
        }
    }
});

observer.observe(document.getElementById("horizon"), {
    attributes: true,
    attributeFilter: [
        "style"
    ]
});

window.addEventListener("resize", () => editor.layout());

const versionSelect: HTMLSelectElement = document.getElementById("syntax-version") as HTMLSelectElement;

for (const v of Object.keys(Version)) {
    const opt = document.createElement("option");
    opt.textContent = Version[v];
    opt.value = v;
    versionSelect.appendChild(opt);

    if (Version[v] === Version.v750) {
        versionSelect.selectedIndex = opt.index;
    }
}

let cy;

versionSelect.onchange = update;

editor.onDidChangeModelContent(update);
update();

editor.focus();

function buildTree(node: INode, id: any = {number: 1}, parentId: string = null): any[] {
    const nodeColors = {
        "StructureNode": "pink",
        "StatementNode": "lightyellow",
        "ExpressionNode": "lightgreen",
        "TokenNode": "lightblue",
        "TokenNodeRegex": "lightblue"
    };

    const nodeId: string = `node_${id.number}`;

    let result: any[] = [
        {
            data: {
                id: nodeId,
                node: node,
                color: nodeColors[node.constructor.name] || "lightgrey"
            }
        }
    ];

    if (parentId) {
        result.push({
            data: {
                id: `edge_${parentId}_${nodeId}`,
                source: parentId,
                target: nodeId
            }
        });
    }

    const children = node.getChildren();

    if (children && children.length) {
        for (const c of children) {
            id.number++;
            result = result.concat(buildTree(c, id, nodeId));
        }
    }

    return result;
}

function update() {
    try {
        const contents = editor.getValue();
        const file = new abaplint.MemoryFile(filename, contents);

        const config = registry.getConfig();
        config.getSyntaxSetttings().version = versionSelect.selectedOptions[0].value as Version;

        registry.updateFile(file);
        registry.parse();

        abapMonaco.updateMarkers(registry, model);

        const obj: ABAPObject = registry.getObjects()[0] as ABAPObject;
        new SyntaxLogic(registry, obj).run();

        const abapFile = obj.getABAPFiles()[0];

        const structure: INode = abapFile.getStructure();

        if (!structure) {
            return;
        }

        if (!cy) {
            cy = cytoscape({
                container: document.getElementById("diagram"),
                elements: buildTree(structure),
                style: [
                    {
                        selector: "edge",
                        style: {
                            "target-arrow-shape": "triangle",
                            "curve-style": "straight"
                        }
                    },
                    {
                        selector: "node",
                        style: {
                            "background-color": "data(color)",
                            "border-width": "2",
                            "border-style": "solid",
                            "border-color": "grey",
                            "shape": "rectangle",
                            "text-valign": "center",
                            "text-halign": "center",
                            "font-family": "data(font)",
                            "text-wrap": "wrap",
                            "width": "200"
                        }
                    }
                ]
            });

            cy.nodeHtmlLabel([{
                query: "node",
                halign: "center",
                valign: "center",
                halignBox: "center",
                valignBox: "center",
                tpl: data => {
                    const node = data.node;
                    return `<div class="node-label ${node instanceof TokenNode ? "token" : ""}">
                                <div class="main">${node instanceof TokenNode ? node.getFirstToken().getStr() : node.get().constructor.name}</div>
                                <div class="sub">${node.constructor.name}</div>
                            </div>`;
                }
            }]);
        }
        else {
            cy.json({
                elements: buildTree(structure)
            });
        }

        cy.nodes().ungrabify();

        cy.layout({
            name: "dagre"
        }).run();
    }
    catch (error) {
        console.error(error);
    }
}