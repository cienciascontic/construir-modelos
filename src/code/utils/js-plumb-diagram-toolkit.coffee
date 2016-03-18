# Purpose of this class: Provide an abstraction over our chosen diagramming toolkit.

module.exports = class DiagramToolkit

  constructor: (@domContext, @options = {}) ->
    @type      = "jsPlumbWrappingDiagramToolkit"
    @color     = @options.color or '#233'
    @lineWidth = @options.lineWidth or 1
    @lineWidth = 1
    @kit       = jsPlumb.getInstance {Container: @domContext}
    @kit.importDefaults
      Connector:        ["Bezier", {curviness: 60}],
      Anchor:           "Continuous",
      DragOptions :     {cursor: 'pointer', zIndex:2000},
      ConnectionsDetachable: true,
      DoNotThrowErrors: false
    @registerListeners()

  registerListeners: ->
    @kit.bind 'connection', @handleConnect.bind @
    @kit.bind 'beforeDrag', (source) =>
      @$currentSource = $(source.source)
      @$currentSource.addClass("show-drag")
      true
    @kit.bind ['connectionAborted', 'beforeDrop'], (args) =>
      @$currentSource.removeClass("show-drag")
      true

  handleConnect: (info, evnt)  ->
    @options.handleConnect? info, evnt
    true

  handleClick: (connection, evnt) ->
    @options.handleClick? connection, evnt

  handleLabelClick: (label, evnt) ->
    @options.handleClick? label.component, evnt

  handleDisconnect: (info, evnt) ->
    return (@options.handleDisconnect? info, evnt) or true

  repaint: ->
    @kit.repaintEverything()

  _endpointOptions: [ "Dot", { radius:15 } ]

  makeSource: (div) ->
    endpoints = @kit.addEndpoint(div,
      isSource: true
      dropOptions:
        activeClass: "dragActive"
      anchor: "Center"
      #paintStyle: @_paintStyle()
      endpoint: ["Rectangle",
        width: 19
        height: 19
        cssClass: 'node-link-button'
      ]
      maxConnections: -1
    )

    addHoverState = (endpoint) ->
      endpoint.bind "mouseover", ->
        $(endpoint.element).addClass("show-hover")
      endpoint.bind "mouseout", ->
        $(endpoint.element).removeClass("show-hover")

    if endpoints?.element
      addHoverState endpoints
    else if endpoints?.length
      _.forEach endpoints, addHoverState

  makeTarget: (div) ->
    size = 60
    @kit.addEndpoint(div,
      isTarget: true
      isSource: false
      anchor: "Center"
      endpoint: ["Rectangle",
        height: size
        width: size
        cssClass: "node-link-target"
      ]
      maxConnections: -1
      dropOptions:
        activeClass: "dragActive"
     )

  clear: ->
    if @kit
      @kit.deleteEveryEndpoint()
      @kit.reset()
      @registerListeners()
    else
      log.info "No kit defined"

  _paintStyle: (color) ->
    strokeStyle: color or @color,
    lineWidth: @lineWidth
    outlineColor: "rgb(0,240,10)"
    outlineWidth: "10px"

  _overlays: (label, selected) ->
    results = [["Arrow", {
      location: 1.0
      length: 10
      width: 10
      events: { click: @handleLabelClick.bind @ }
    }]]
    if label?.length > 0
      results.push ["Label", {
        location: 0.5,
        events: { click: @handleLabelClick.bind @ },
        label: label or '',
        cssClass: "label#{if selected then ' selected' else ''}"
      }]
    results

  _clean_borked_endpoints: ->
    $('._jsPlumb_endpoint:not(.jsplumb-draggable)').remove()

  addLink: (source, target, label, color, isSelected, linkModel) ->
    paintStyle = @_paintStyle color
    paintStyle.outlineColor = "none"
    paintStyle.outlineWidth = 20
    if isSelected
      paintStyle.outlineColor = "#f6bf33"
      paintStyle.outlineWidth = 1

    connection = @kit.connect
      source: source
      target: target
      paintStyle: paintStyle
      overlays: @_overlays label, isSelected
      endpoint: ["Rectangle",
        width: 10
        height: 10
        cssClass: 'node-link-target'
      ]

    connection.bind 'click', @handleClick.bind @
    connection.linkModel = linkModel

  setSuspendDrawing: (shouldwestop) ->
    if not shouldwestop
      @_clean_borked_endpoints()
    @kit.setSuspendDrawing shouldwestop, not shouldwestop

  supspendDrawing: ->
    @setSuspendDrawing true

  resumeDrawing: ->
    @setSuspendDrawing false
