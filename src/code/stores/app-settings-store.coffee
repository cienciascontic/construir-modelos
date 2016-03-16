HashParams      = require '../utils/hash-parameters'
ImportActions   = require '../actions/import-actions'

AppSettingsActions = Reflux.createActions(
  [
    "diagramOnly"
    "showMinigraphs"
  ]
)

AppSettingsStore   = Reflux.createStore
  listenables: [AppSettingsActions, ImportActions]

  init: ->
    @settings =
      showingSettingsDialog: false
      diagramOnly: HashParams.getParam('simplified')
      showingMinigraphs: false

  onDiagramOnly: (diagramOnly) ->
    @settings.diagramOnly = diagramOnly
    if diagramOnly then @settings.showingMinigraphs = false
    @notifyChange()

  onShowMinigraphs: (show) ->
    @settings.showingMinigraphs = show
    @notifyChange()

  notifyChange: ->
    @trigger _.clone @settings
    if @settings.diagramOnly
      HashParams.setParam('simplified','true')
    else
      HashParams.clearParam('simplified')

  onImport: (data) ->
    _.merge @settings, data.settings
    @notifyChange()

  serialize: ->
    diagramOnly: @settings.diagramOnly
    showingMinigraphs: @settings.showingMinigraphs

mixin =
  getInitialState: ->
    _.clone AppSettingsStore.settings

  componentDidMount: ->
    @unsubscribe = AppSettingsStore.listen @onAppSettingsChange

  componentWillUnmount: ->
    @unsubscribe()

  onAppSettingsChange: (newData) ->
    @setState _.clone newData

module.exports =
  actions: AppSettingsActions
  store: AppSettingsStore
  mixin: mixin
