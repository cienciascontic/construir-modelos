GraphPrimitive = require('./graph-primitive')

class Link extends GraphPrimitive
  @defaultColor: "#777"
  constructor: (@options={}) ->
    @options.color ||= Link.defaultColor
    @options.title ||= ""
    { @sourceNode, @sourceTerminal ,@targetNode, @targetTerminal, @color, @title} = @options
    super()

  type: () ->
    "Link"
  terminalKey: () ->
    "#{@sourceNode.key}[#{@sourceTerminal}] ---#{@key}---> #{@targetNode.key}[#{@targetTerminal}]"
  nodeKey: () ->
    "#{@sourceNode} ---#{@key}---> #{@targetNode}"
  outs: () ->
    [@targetNode]
  ins: () ->
    [@sourceNode]

module.exports = Link