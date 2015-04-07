{div, h2, label, input, select, option, optgroup, button} = React.DOM

module.exports = React.createClass

  displayName: 'NodeEdit'

  changeTitle: (e) ->
    @props.onNodeChanged? @props.node, e.target.value, @props.node.image

  changeImage: (e) ->
    @props.onNodeChanged? @props.node, @props.node.title, e.target.value

  addRemote: (e) ->
    src = $.trim(@refs.remoteUrl?.getDOMNode().value or '')
    if src.length > 0
      img = new Image
      img.onload = =>
        @props.onNodeChanged? @props.node, @props.node.title, src
        @props.onAddRemoteImage? src
      img.onerror = =>
        alert "Sorry, could not load #{src}"
        @refs.remoteUrl.getDOMNode().focus()
      img.src = src

  render: ->
    if @props.node
      (div {className: 'node-edit-view'},
        (h2 {}, @props.node.title)
        (div {className: 'edit-row'},
          (label {htmlFor: 'title'}, 'Title')
          (input {type: 'text', name: 'title', value: @props.node.title, onChange: @changeTitle})
        )
        (div {className: 'edit-row'},
          (label {htmlFor: 'image'}, 'Image')
          (select {name: 'image', value: @props.node.image, onChange: @changeImage},
            (optgroup {label: 'Built-In'},
              for node, i in @props.protoNodes
                if node.type is 'builtin'
                  (option {key: i, value: node.image}, if node.title.length > 0 then node.title else '(none)')
            )
            (optgroup {label: 'Remote'},
              for node, i in @props.protoNodes
                if node.type is 'remote'
                  (option {key: i, value: node.image}, node.image)
              (option {key: i, value: '#remote'}, 'Add Remote...')
            )
          )
        )
        if @props.node.image is '#remote'
          (div {},
            (div {className: 'edit-row'},
              (label {htmlFor: 'remoteUrl'}, 'URL')
              (input {type: 'text', ref: 'remoteUrl', name: 'remoteUrl', placeholder: 'Remote image url'})
            )
            (div {className: 'edit-row'},
              (label {htmlFor: 'save'}, '')
              (button {name: 'save', onClick: @addRemote}, 'Add Remote Image')
            )
          )
      )
    else
      (div {className: 'node-edit-view hidden'})
