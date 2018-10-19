/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * DS208: Avoid top-level this
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

// TODO: remove when modules are converted to TypeScript style modules
export {};

const Importer            = require("../utils/importer");
const Link                = require("../models/link");
const NodeModel           = require("../models/node");
const TransferModel       = require("../models/transfer");
const UndoRedo            = require("../utils/undo-redo");
const SelectionManager    = require("../models/selection-manager");
const PaletteStore        = require("../stores/palette-store");
const tr                  = require("../utils/translate");
const Migrations          = require("../data/migrations/migrations");
const PaletteDeleteStore  = require("../stores/palette-delete-dialog-store");
const AppSettingsStore    = require("../stores/app-settings-store");
const SimulationStore     = require("../stores/simulation-store");
const GraphActions        = require("../actions/graph-actions");
const CodapActions        = require("../actions/codap-actions");
const LaraActions         = require("../actions/lara-actions");
const InspectorPanelStore = require("../stores/inspector-panel-store");
const CodapConnect        = require("../models/codap-connect");
const LaraConnect         = require("../models/lara-connect");
const RelationFactory     = require("../models/relation-factory");
const GraphPrimitive      = require("../models/graph-primitive");
const DEFAULT_CONTEXT_NAME = "building-models";

const GraphStore  = Reflux.createStore({
  init(context) {
    this.linkKeys           = {};
    this.nodeKeys           = {};
    this.loadListeners      = [];
    this.filename           = null;
    this.filenameListeners  = [];

    this.undoRedoManager    = UndoRedo.instance({debug: false, context});
    this.selectionManager   = new SelectionManager();
    PaletteDeleteStore.store.listen(this.paletteDelete.bind(this));

    SimulationStore.actions.createExperiment.listen(this.resetSimulation.bind(this));
    SimulationStore.actions.setDuration.listen(this.resetSimulation.bind(this));
    SimulationStore.actions.capNodeValues.listen(this.resetSimulation.bind(this));
    SimulationStore.actions.simulationFramesCreated.listen(this.updateSimulationData.bind(this));

    this.usingCODAP = false;
    this.usingLara = false;
    this.codapStandaloneMode = false;

    return this.lastRunModel = "";
  },   // string description of the model last time we ran simulation

  resetSimulation() {
    for (const node of this.getNodes()) {
      node.frames = [];
    }
    return this.updateListeners();
  },

  _trimSimulation() {
    for (const node of this.getNodes()) {
      // leaving some excess data reduces flicker during rapid changes
      const excessFrames = node.frames.length - (2 * SimulationStore.store.simulationDuration());
      if (excessFrames > 0) {
        node.frames.splice(0, excessFrames);
      }
    }

  },  // prevent unused default return value

  updateSimulationData(data) {
    const nodes = this.getNodes();
    for (const frame of data) {
      for (let i = 0; i < frame.nodes.length; i++) {
        const node = frame.nodes[i];
        if (nodes[i] != null) {
          nodes[i].frames.push(node.value);
        }
      }
    }

  },  // prevent unused default return value

  paletteDelete(status) {
    const {deleted, paletteItem, replacement} = status;
    if (deleted && paletteItem && replacement) {
      for (const node of this.getNodes()) {
        if (node.paletteItemIs(paletteItem)) {
          this.changeNode({image: replacement.image, paletteItem: replacement.uuid}, node);
        }
      }
    }

  },  // prevent unused default return value

  // This and redo() can be called from three sources, and we can be in two different
  // modes. It can be called from the 1) button press, 2) keyboard, and 3) CODAP action.
  // We can be in CODAP standalone mode or not.
  //
  // The undoRedoManager should handle the undo/redo when EITHER we are not running
  // in CODAP or the undo/redo has been initiated from CODAP
  //
  // CODAP should handle the undo/redo when we are running from CODAP in either
  // standalone or non-standalone mode and CODAP did not initiate the request
  undo(fromCODAP) {
    if (fromCODAP || !this.usingCODAP) {
      return this.undoRedoManager.undo();
    } else {
      return CodapActions.sendUndoToCODAP();
    }
  },

  redo(fromCODAP) {
    if (fromCODAP || !this.usingCODAP) {
      return this.undoRedoManager.redo();
    } else {
      return CodapActions.sendRedoToCODAP();
    }
  },

  setSaved() {
    return this.undoRedoManager.save();
  },

  revertToOriginal() {
    return this.undoRedoManager.revertToOriginal();
  },

  revertToLastSave() {
    return this.undoRedoManager.revertToLastSave();
  },

  setUsingCODAP(usingCODAP) {
    this.usingCODAP = usingCODAP;
  },
  setUsingLara(usingLara) {
    this.usingLara = usingLara;
  },

  setCodapStandaloneMode(codapStandaloneMode) {
    this.codapStandaloneMode = codapStandaloneMode;
  },

  addChangeListener(listener) {
    log.info("adding change listener");
    return this.undoRedoManager.addChangeListener(listener);
  },

  addFilenameListener(listener) {
    log.info(`adding filename listener ${listener}`);
    return this.filenameListeners.push(listener);
  },

  setFilename(filename) {
    this.filename = filename;
    return this.filenameListeners.map((listener) =>
      listener(filename));
  },

  getLinks() {
    return ((() => {
      const result: any = [];
      for (const key in this.linkKeys) {
        const value = this.linkKeys[key];
        result.push(value);
      }
      return result;
    })());
  },

  getNodes() {
    return ((() => {
      const result: any = [];
      for (const key in this.nodeKeys) {
        const value = this.nodeKeys[key];
        result.push(value);
      }
      return result;
    })());
  },

  hasLink(link) {
    return (this.linkKeys[link.terminalKey()] != null);
  },

  hasNode(node) {
    return (this.nodeKeys[node.key] != null);
  },

  importLink(linkSpec) {
    let transferNode;
    const sourceNode = this.nodeKeys[linkSpec.sourceNode];
    const targetNode = this.nodeKeys[linkSpec.targetNode];
    if (linkSpec.transferNode) { transferNode = this.nodeKeys[linkSpec.transferNode]; }
    linkSpec.sourceNode = sourceNode;
    linkSpec.targetNode = targetNode;
    if (transferNode) {
      linkSpec.transferNode = transferNode;
    } else {
      delete linkSpec.transferNode;
    }
    const link = new Link(linkSpec);
    this.addLink(link);
    return link;
  },

  addLink(link) {
    this.endNodeEdit();
    return this.undoRedoManager.createAndExecuteCommand("addLink", {
      execute: () => this._addLink(link),
      undo: () => this._removeLink(link)
    }
    );
  },

  _addLink(link) {
    if ((link.sourceNode !== link.targetNode) && !this.hasLink(link)) {
      this.linkKeys[link.terminalKey()] = link;
      this.nodeKeys[link.sourceNode.key].addLink(link);
      this.nodeKeys[link.targetNode.key].addLink(link);
    }
    this._graphUpdated();
    return this.updateListeners();
  },


  removeLink(link) {
    this.endNodeEdit();
    return this.undoRedoManager.createAndExecuteCommand("removeLink", {
      execute: () => {
        this._removeLink(link);
        if (link.transferNode != null) { return this._removeTransfer(link); }
      },
      undo: () => {
        if (link.transferNode != null) { this._addTransfer(link); }
        return this._addLink(link);
      }
    }
    );
  },

  _removeLink(link) {
    delete this.linkKeys[link.terminalKey()];
    if (this.nodeKeys[link.sourceNode.key] != null) {
      this.nodeKeys[link.sourceNode.key].removeLink(link);
    }
    if (this.nodeKeys[link.targetNode.key] != null) {
      this.nodeKeys[link.targetNode.key].removeLink(link);
    }
    this._graphUpdated();
    return this.updateListeners();
  },

  isUniqueTitle(title, skipNode, nodes) {
    if (nodes == null) { nodes = this.getNodes(); }
    const nonUniqueNode = (otherNode) => {
      const sameTitle = otherNode.title === title;
      if (skipNode) { return sameTitle && (otherNode !== skipNode); } else { return sameTitle; }
    };
    return !_.find(nodes, nonUniqueNode);
  },

  ensureUniqueTitle(node, newTitle) {
    if (newTitle == null) { newTitle = node.title; }
    const nodes = this.getNodes();
    if (!this.isUniqueTitle(newTitle, node, nodes)) {
      let index = 2;
      const endsWithNumber = / (\d+)$/;
      const matches = newTitle.match(endsWithNumber);
      if (matches) {
        index = parseInt(matches[1], 10) + 1;
        newTitle = newTitle.replace(endsWithNumber, "");
      }
      const template = `${newTitle} %{index}`;
      while (true) {
        newTitle = tr(template, {index: index++});
        if (this.isUniqueTitle(newTitle, node, nodes)) { break; }
      }
    }
    return newTitle;
  },

  addNode(node) {
    this.endNodeEdit();
    node.title = this.ensureUniqueTitle(node);
    return this.undoRedoManager.createAndExecuteCommand("addNode", {
      execute: () => this._addNode(node),
      undo: () => this._removeNode(node)
    }
    );
  },

  removeNode(nodeKey) {
    this.endNodeEdit();
    const node = this.nodeKeys[nodeKey];
    const transferRelation = node.transferLink != null ? node.transferLink.relation : undefined;

    // create a copy of the list of links
    const links = node.links.slice();
    // identify any transfer nodes that need to be removed as well
    const transferLinks: any = [];
    _.each(links, (link) => {
      if (__guard__(link != null ? link.transferNode : undefined, x => x.key) != null) {
        return transferLinks.push(link);
      }
    });

    return this.undoRedoManager.createAndExecuteCommand("removeNode", {
      execute: () => {
        if (node.transferLink != null) {
          node.transferLink.relation = node.transferLink.defaultRelation();
        }
        for (const link of links) { this._removeLink(link); }
        for (const link of transferLinks) { this._removeTransfer(link); }
        return this._removeNode(node);
      },
      undo: () => {
        if (node.transferLink != null) {
          node.transferLink.relation = transferRelation;
        }
        this._addNode(node);
        for (const link of transferLinks) { this._addTransfer(link); }
        for (const link of links) { this._addLink(link); }
      }
    }
    );
  },

  _addNode(node) {
    if (!this.hasNode(node)) {
      this.nodeKeys[node.key] = node;
      this._graphUpdated();
      // add variable to CODAP
      CodapConnect.instance(DEFAULT_CONTEXT_NAME)._createMissingDataAttributes();
      return this.updateListeners();
    }
  },

  _removeNode(node) {
    delete this.nodeKeys[node.key];
    this._graphUpdated();
    return this.updateListeners();
  },

  _addTransfer(link) {
    if (link.transferNode == null) {
      const source = link.sourceNode;
      const target = link.targetNode;
      link.transferNode = new TransferModel({
        x: source.x + ((target.x - source.x) / 2),
        y: source.y + ((target.y - source.y) / 2)
      });
      link.transferNode.setTransferLink(link);
    }
    return this._addNode(link.transferNode);
  },

  _removeTransfer(tLink) {
    const transfer = tLink.transferNode;
    if (!transfer) { return; }

    const links = this.getLinks();
    _.each(links, link => {
      if ((link.sourceNode === transfer) || (link.targetNode === transfer)) {
        return this.removeLink(link);
      }
    });
    return this._removeNode(transfer);
  },

  _graphUpdated() {
    return (() => {
      const result: any = [];
      for (const key in this.nodeKeys) {
        const node = this.nodeKeys[key];
        result.push(node.checkIsInIndependentCycle());
      }
      return result;
    })();
  },

  moveNodeCompleted(nodeKey, leftDiff, topDiff) {
    this.endNodeEdit();
    return this.undoRedoManager.createAndExecuteCommand("moveNode", {
      execute: () => this.moveNode(nodeKey, 0, 0),
      undo: () => this.moveNode(nodeKey, -leftDiff, -topDiff),
      redo: () => this.moveNode(nodeKey, leftDiff, topDiff)
    }
    );
  },

  moveNode(nodeKey, leftDiff, topDiff) {
    const node = this.nodeKeys[nodeKey];
    if (!node) { return; }
    // alert "moveNode:" + nodeKey + " " + node.x + " "
    // console.log "moveNode:", node, leftDiff,  topDiff
    node.x = node.x + leftDiff;
    node.y = node.y + topDiff;
    return this.updateListeners();
  },

  selectedNodes() {
    return this.selectionManager.getNodeInspection() || [];
  }, // add or [] into getNodeInspection() ?

  selectedLinks() {
    return this.selectionManager.getLinkInspection() || [];
  }, // add or [] into getLinkInspection() ?

  editingNode() {
    return this.selectionManager.selection(SelectionManager.NodeTitleEditing)[0] || null;
  },

  editNode(nodeKey) {
    return this.selectionManager.selectNodeForTitleEditing(this.nodeKeys[nodeKey]);
  },

  selectNode(nodeKey) {
    this.endNodeEdit();
    return this.selectionManager.selectNodeForInspection(this.nodeKeys[nodeKey]);
  },


  _notifyNodeChanged(node) {
    this._maybeChangeSelectedItem(node);
    return this.updateListeners();
  },

  changeNode(data, node) {
    const _node = node || this.selectedNodes();
    const nodes = [].concat(_node); // force an array of nodes
    return (() => {
      const result: any = [];
      for (node of nodes) {
        if (node) {
          const originalData = {
            title: node.title,
            image: node.image,
            paletteItem: node.paletteItem,
            color: node.color,
            initialValue: node.initialValue,
            value: node.value || node.initialValue,
            min: node.min,
            max: node.max,
            isAccumulator: node.isAccumulator,
            allowNegativeValues: node.allowNegativeValues,
            combineMethod: node.combineMethod,
            valueDefinedSemiQuantitatively: node.valueDefinedSemiQuantitatively
          };

          let nodeChanged = false;
          for (const key in data) {
            if (data.hasOwnProperty(key)) {
              if (data[key] !== originalData[key]) { nodeChanged = true; }
            }
          }

          if (nodeChanged) {        // don't do anything unless we've actually changed the node

            let changedLinks, link, originalRelations;
            const accumulatorChanged = (data.isAccumulator != null) &&
                                  (!!data.isAccumulator !== !!originalData.isAccumulator);

            if (accumulatorChanged) {
              // all inbound links are invalidated
              changedLinks = [].concat(node.inLinks())
              // along with outbound transfer links
                .concat(_.filter(node.outLinks(), link =>
                  (link.relation.type === "transfer") ||
                                  (link.relation.type === "initial-value")
                ));
              originalRelations = {};
              for (link of changedLinks) {
                originalRelations[link.key] = link.relation;
              }
            }

            this.undoRedoManager.startCommandBatch();
            this.undoRedoManager.createAndExecuteCommand("changeNode", {
              execute: () => {
                if (accumulatorChanged) {
                  for (link of changedLinks) {
                    this._changeLink(link, { relation: link.defaultRelation() });
                  }
                }
                return this._changeNode(node, data);
              },
              undo: () => {
                this._changeNode(node, originalData);
                if (accumulatorChanged) {
                  for (link of changedLinks) {
                    this._changeLink(link, { relation: originalRelations[link.key] });
                  }
                }
              }
            }
            );
            result.push(this.undoRedoManager.endCommandBatch());
          } else {
            result.push(undefined);
          }
        } else {
          result.push(undefined);
        }
      }
      return result;
    })();
  },

  _changeNode(node, data, notifyCodap) {
    if (notifyCodap == null) { notifyCodap = true; }
    log.info(`Change for ${node.title}`);
    for (const key of NodeModel.fields) {
      if (data.hasOwnProperty(key)) {
        log.info(`Change ${key} for ${node.title}`);
        const prev = node[key];
        node[key] = data[key];
        if (key === "title") {
          if (notifyCodap && this.usingCODAP) {
            const codapConnect = CodapConnect.instance(DEFAULT_CONTEXT_NAME);
            codapConnect.sendRenameAttribute(node.key, prev);
          }
          this._maybeChangeTransferTitle(node);
        }
      }
    }
    node.normalizeValues(_.keys(data));
    return this._notifyNodeChanged(node);
  },

  changeNodeProperty(property, value, node) {
    const data = {};
    data[property] = value;
    return this.changeNode(data, node);
  },

  changeNodeWithKey(key, data) {
    const node = this.nodeKeys[ key ];
    if (node) {
      return this.changeNode(data, node);
    }
  },

  startNodeEdit() {
    return this.undoRedoManager.startCommandBatch("changeNode");
  },

  endNodeEdit() {
    return this.undoRedoManager.endCommandBatch();
  },

  clickLink(link, multipleSelectionsAllowed) {
    // this is to allow both clicks and double clicks
    const now = (new Date()).getTime();
    const isDoubleClick = (now - (this.lastClickLinkTime || 0)) <= 250;
    this.lastClickLinkTime = now;
    clearTimeout(this.lastClickLinkTimeout);

    if (isDoubleClick) {
      this.selectionManager.selectNodeForInspection(link.targetNode);
      if (AppSettingsStore.store.settings.simulationType !== AppSettingsStore.store.SimulationType.diagramOnly) {
        return InspectorPanelStore.actions.openInspectorPanel("relations", {link});
      }
    } else {
      // set single click handler to run 250ms from now so we can wait to see if this is a double click
      const singleClickHandler = () => {
        if (this.selectionManager.isSelected(link)) {
          return this.selectionManager.selectLinkForTitleEditing(link);
        } else {
          return this.selectionManager.selectLinkForInspection(link, multipleSelectionsAllowed);
        }
      };
      return this.lastClickLinkTimeout = setTimeout(singleClickHandler, 250);
    }
  },

  editLink(link) {
    return this.selectionManager.selectLinkForTitleEditing(link);
  },

  changeLink(link, changes) {
    if (changes == null) { changes = {}; }
    if (changes.deleted) {
      return this.removeSelectedLinks();
    } else if (link) {
      const originalData = {
        title: link.title,
        color: link.color,
        relation: link.relation,
        reasoning: link.reasoning
      };
      this.undoRedoManager.startCommandBatch();
      this.undoRedoManager.createAndExecuteCommand("changeLink", {
        execute: () => this._changeLink(link,  changes),
        undo: () => this._changeLink(link, originalData)
      }
      );
      return this.undoRedoManager.endCommandBatch();
    }
  },

  _maybeChangeSelectedItem(item) {
    // TODO: This is kind of hacky:
    if (this.selectionManager.isSelected(item)) {
      return this.selectionManager._notifySelectionChange();
    }
  },

  _maybeChangeRelation(link, relation) {
    if (relation && relation.isTransfer) {
      return this._addTransfer(link);
    } else {
      return this._removeTransfer(link);
    }
  },

  _maybeChangeTransferTitle(changedNode) {
    return (() => {
      const result: any = [];
      for (const key in this.nodeKeys) {
        const node = this.nodeKeys[key];
        const { transferLink } = node;
        if (transferLink && ((transferLink.sourceNode === changedNode) || (transferLink.targetNode === changedNode))) {
          result.push(this.changeNodeWithKey(key, {title: node.computeTitle()}));
        } else {
          result.push(undefined);
        }
      }
      return result;
    })();
  },

  _changeLink(link, changes) {
    log.info(`Change  for ${link.title}`);
    for (const key of ["title", "color", "relation", "reasoning"]) {
      if (changes[key] != null) {
        log.info(`Change ${key} for ${link.title}`);
        link[key] = changes[key];
      }
    }
    this._maybeChangeRelation(link, changes.relation);
    this._maybeChangeSelectedItem(link);
    this._graphUpdated();
    return this.updateListeners();
  },

  _nameForNode(node) {
    return this.nodeKeys[node];
  },

  newLinkFromEvent(info) {
    const newLink = {};
    const startKey = $(info.source).data("node-key") || "undefined";
    const endKey   = $(info.target).data("node-key") || "undefined";
    const startTerminal = info.connection.endpoints[0].anchor.type === "Top" ? "a" : "b";
    const endTerminal   = info.connection.endpoints[1].anchor.type === "Top" ? "a" : "b";
    this.importLink({
      sourceNode: startKey,
      targetNode: endKey,
      sourceTerminal: startTerminal,
      targetTerminal: endTerminal,
      color: info.color,
      title: info.title
    });
    return true;
  },

  deleteAll() {
    for (const node in this.nodeKeys) {
      this.removeNode(node);
    }
    GraphPrimitive.resetCounters();
    this.setFilename("New Model");
    return this.undoRedoManager.clearHistory();
  },

  removeSelectedNodes() {
    const selectedNodeKeys = this.selectedNodes().map((node) => node.key);
    return selectedNodeKeys.map((nodeKey) => this.removeNode(nodeKey));
  },

  removeSelectedLinks() {
    return this.selectedLinks().map((selectedLink) => this.removeLink(selectedLink));
  },

  deleteSelected() {
    log.info("Deleting selected items");
    // deleting multiple links/nodes should be undoable as a single action
    this.undoRedoManager.startCommandBatch();
    this.removeSelectedLinks();
    this.removeSelectedNodes();
    this.undoRedoManager.endCommandBatch();
    return this.selectionManager.clearSelection();
  },

  removeLinksForNode(node) {
    return node.links.map((link) => this.removeLink(link));
  },

  // getDescription returns one or more easily-comparable descriptions of the graph's
  // state, customized for different applications (e.g. deciding whether to redraw links),
  // while only looping through the nodes and links once.
  //
  // links: link terminal locations, and link formula (for stroke style), plus number of nodes
  //         e.g. "10,20;1 * in;50,60|" for each link
  // model: description of each link relationship and the values of its terminal nodes
  //         e.g. "node-0:50;1 * in;node-1:50|" for each link
  //
  // We pass nodes and links so as not to calculate @getNodes and @getLinks redundantly.
  getDescription(nodes, links) {
    const { settings } = SimulationStore.store;

    let linkDescription = "";
    let modelDescription = `steps:${settings.duration}|cap:${settings.capNodeValues}|`;

    _.each(links, (link) => {
      let source, target;
      if ((!(source = link.sourceNode)) || (!(target = link.targetNode))) { return; }
      linkDescription += `${source.x},${source.y};`;
      linkDescription += link.relation.formula + ";";
      linkDescription += `${target.x},${target.y}|`;
      if (link.relation.isDefined) {
        const isCappedAccumulator = source.isAccumulator && !source.allowNegativeValues;
        const capValue = isCappedAccumulator ? ":cap" : "";
        modelDescription += `${source.key}:${source.initialValue}${capValue};`;
        modelDescription += link.relation.formula + ";";
        if (link.relation.type === "transfer") {
          const transfer = link.transferNode;
          if (transfer) { modelDescription += `${transfer.key}:${transfer.initialValue}:${transfer.combineMethod};`; }
        }
        modelDescription += `${target.key}${target.isAccumulator ? `:${target.value != null ? target.value : target.initialValue}` : ""}`;
        return modelDescription += `;${target.combineMethod}|`;
      }
    });
    linkDescription += nodes.length;     // we need to redraw targets when new node is added

    return {
      links: linkDescription,
      model: modelDescription
    };
  },

  // Returns the minimum simulation type that the current graph allows.
  // Returns
  //   0 (diagramOnly)    if there are no defined relationships
  //   1 (static)         if there are no collectors
  //   2 (time)           if there are collectors
  getMinimumSimulationType() {
    let minSimulationType = AppSettingsStore.store.SimulationType.diagramOnly;

    const links = this.getLinks();
    for (const link of links) {
      let source, target;
      if ((!(source = link.sourceNode)) || (!(target = link.targetNode))) { continue; }

      if (source.isAccumulator || target.isAccumulator) {
        // we know we have to be time-based
        return AppSettingsStore.store.SimulationType.time;
      } else if (link.relation != null ? link.relation.formula : undefined) {
        // we have a defined relationship, so we know we'll be at least 1
        minSimulationType = AppSettingsStore.store.SimulationType.static;
      }
    }

    return minSimulationType;
  },

  // Returns the minimum complexity that the current graph allows.
  // Returns
  //   0 (basic)          if there are no defined relationships, or all scalars are `about the same`
  //   1 (expanded)       otherwise
  getMinimumComplexity() {
    const links = this.getLinks();
    for (const link of links) {
      let source, target;
      if ((!(source = link.sourceNode)) || (!(target = link.targetNode))) { continue; }

      if (link.relation != null ? link.relation.formula : undefined) {
        const relation = RelationFactory.selectionsFromRelation(link.relation);
        if (relation.scalar && (relation.scalar.id !== "aboutTheSame")) {
          return AppSettingsStore.store.Complexity.expanded;
        }
      }
    }

    return AppSettingsStore.store.Complexity.basic;
  },

  loadData(data) {
    log.info("json success");
    const importer = new Importer(this, AppSettingsStore.store, PaletteStore);
    importer.importData(data);
    return this.undoRedoManager.clearHistory();
  },

  loadDataFromUrl: url => {
    log.info("loading local data");
    log.info(`url ${url}`);
    return $.ajax({
      url,
      dataType: "json",
      success: data => {
        return this.loadData(data);
      },
      error(xhr, status, err) {
        return log.error(url, status, err.toString());
      }
    });
  },

  serialize(palette) {
    let key;
    const nodeExports = (() => {
      const result: any = [];
      for (key in this.nodeKeys) {
        const node = this.nodeKeys[key];
        result.push(node.toExport());
      }
      return result;
    })();
    const linkExports = (() => {
      const result1: any = [];
      for (key in this.linkKeys) {
        const link = this.linkKeys[key];
        result1.push(link.toExport());
      }
      return result1;
    })();
    const settings = AppSettingsStore.store.serialize();
    settings.simulation = SimulationStore.store.serialize();

    const data = {
      version: Migrations.latestVersion(),
      filename: this.filename,
      palette,
      nodes: nodeExports,
      links: linkExports,
      settings
    };
    return data;
  },

  toJsonString(palette) {
    return JSON.stringify(this.serialize(palette));
  },

  getGraphState() {
    const nodes = this.getNodes();
    const links = this.getLinks();
    const description = this.getDescription(nodes, links);

    return {
      nodes,
      links,
      description
    };
  },

  updateListeners() {
    const graphState = this.getGraphState();
    GraphActions.graphChanged.trigger(graphState);

    if (this.lastRunModel !== graphState.description.model) {
      this._trimSimulation();
      SimulationStore.actions.runSimulation();
      this.lastRunModel = graphState.description.model;
    }
  }
});

const mixin = {
  getInitialState() {
    return GraphStore.getGraphState();
  },

  componentDidMount() {
    this.subscriptions = [];
    this.subscriptions.push(GraphActions.graphChanged.listen(this.onGraphChanged));
    return this.subscriptions.push(GraphActions.resetSimulation.listen(this.onResetSimulation));
  },

  componentWillUnmount() {
    return this.subscriptions.map((unsubscribe) => unsubscribe());
  },

  onGraphChanged(state) {
    this.setState(state);

    // TODO: not this:
    return (this.diagramToolkit != null ? this.diagramToolkit.repaint() : undefined);
  },

  onResetSimulation() {
    return GraphStore.resetSimulation();
  }
};

module.exports = {
  // actions: GraphActions
  store: GraphStore,
  mixin
};

function __guard__(value, transform) {
  return (typeof value !== "undefined" && value !== null) ? transform(value) : undefined;
}