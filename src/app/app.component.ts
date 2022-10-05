import { Component } from '@angular/core';
import { Dimensions } from './interfaces/dimensions.interface';
import { ImageCroppedEvent } from './interfaces/image-cropped-event.interface';
import { ImageTransform } from './interfaces/image-transform.interface';
import { base64ToFile } from './utils/blob.utils';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  imageChangedEvent: any = '';
  containWithinAspectRatio = false;
  transform: ImageTransform = {};
  showCropper:boolean=false;
  croppedImage: any = '';
  canvasRotation = 0;
  title = 'flipHorizontalImage';
  imageCropped(event: ImageCroppedEvent) {
    this.croppedImage = event.base64;
    console.log(event, base64ToFile(event.base64|| ''));
}
cropperReady(sourceImageDimensions: Dimensions) {
  console.log('Cropper ready', sourceImageDimensions);
}
  fileChangeEvent(event: any): void {
    this.imageChangedEvent = event;
  }
  flipHorizontal():void{
    this.transform = {
      ...this.transform,
      flipH: !this.transform.flipH
   };
  }
  imageLoaded() {
    this.showCropper = true;
    console.log('Image loaded');
}
}
