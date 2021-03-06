const _ = require("lodash");
import * as React from "react";

import { PaletteItemView } from "./palette-item-view";
import { PaletteAddView } from "./palette-add-view";
import { ImageMetadataView } from "./image-metadata-view";

import { PaletteActions } from "../stores/palette-store";
import { PaletteDeleteDialogActions } from "../stores/palette-delete-dialog-store";
import { NodesMixin, NodesMixinProps, NodesMixinState } from "../stores/nodes-store";

import { tr } from "../utils/translate";

import { PaletteMixinProps, PaletteMixinState, PaletteMixin } from "../stores/palette-store";
import { Mixer } from "../mixins/components";

interface PaletteInspectorViewOuterProps {}
type PaletteInspectorViewProps = PaletteInspectorViewOuterProps & PaletteMixinProps & NodesMixinProps;

interface PaletteInspectorViewOuterState {
}
type PaletteInspectorViewState = PaletteInspectorViewOuterState & PaletteMixinState & NodesMixinState;

export class PaletteInspectorView extends Mixer<PaletteInspectorViewProps, PaletteInspectorViewState> {

  public static displayName = "PaletteInspectorView";

  private palette: HTMLDivElement | null;

  constructor(props: PaletteInspectorViewProps) {
    super(props);
    this.mixins = [new PaletteMixin(this), new NodesMixin(this)];
    const outerState: PaletteInspectorViewOuterState = {
    };
    this.setInitialState(outerState, PaletteMixin.InitialState(), NodesMixin.InitialState());
  }

  public render() {
    const index = 0;
    return (
      <div className="palette-inspector">
        <div className="palette" ref={el => this.palette = el}>
          <div>
            <PaletteAddView label={tr("~PALETTE-INSPECTOR.ADD_IMAGE")} />
            {_.map(this.state.palette, (node, index) => {
              return <PaletteItemView
                key={index}
                index={index}
                node={node}
                image={node.image}
                // selected={index === this.state.selectedPaletteIndex}
                onSelect={this.handleImageSelected}
              />;
            })}
          </div>
        </div>
        {this.state.selectedPaletteItem ?
          <div className="palette-about-image">
            <div className="palette-about-image-info">
              {this.state.selectedPaletteItem.metadata
                ? <ImageMetadataView small={true} metadata={this.state.selectedPaletteItem.metadata} update={PaletteActions.update} />
                : undefined}
              {(this.state.palette.length !== 1) || !this.state.paletteItemHasNodes ?
              <div className="palette-delete" onClick={this.handleDelete}>
                {this.state.paletteItemHasNodes ?
                  <span>
                    <i className="icon-codap-swapAxis" />
                    <label>{tr("~PALETTE-INSPECTOR.REPLACE")}</label>
                  </span>
                  :
                  <span>
                    <i className="icon-codap-trash" />
                    <label>{tr("~PALETTE-INSPECTOR.DELETE")}</label>
                  </span>}
              </div> : undefined}
            </div>
            <div className="palette-about-image-title">
              <img src={this.state.selectedPaletteImage} />
            </div>
          </div> : undefined}
      </div>
    );
  }

  private handleImageSelected = (index) => {
    PaletteActions.selectPaletteIndex(index);
  }

  private handleDelete = () => {
    PaletteDeleteDialogActions.open();
  }
}
