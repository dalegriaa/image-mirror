import { ChangeDetectorRef, Component, ElementRef, EventEmitter, HostBinding, Input, OnInit, Output, ViewChild } from '@angular/core';
import { DomSanitizer, SafeStyle, SafeUrl } from '@angular/platform-browser';
import { CropperPosition } from '../interfaces/cropper-position.interface';
import { Dimensions } from '../interfaces/dimensions.interface';
import { ExifTransform } from '../interfaces/exif-transform.interface';
import { ImageCroppedEvent } from '../interfaces/image-cropped-event.interface';
import { ImageTransform } from '../interfaces/image-transform.interface';
import { MoveStart } from '../interfaces/move-start.interface';
import { getTransformationsFromExifData, supportsAutomaticRotation } from '../utils/exif.utils';
import { resizeCanvas } from '../utils/resize.utils';

@Component({
  selector: 'app-image-cropper',
  templateUrl: './image-cropper.component.html',
  styleUrls: ['./image-cropper.component.scss']
})
export class ImageCropperComponent implements OnInit {
  private originalImage!: HTMLImageElement;
  private transformedImage!: HTMLImageElement;
  private originalBase64: string="";
  private transformedBase64: string ="";
  private moveStart!: MoveStart;
  private originalSize!: Dimensions ;
  private transformedSize!: Dimensions ;
  private autoRotateSupported: Promise<boolean> = supportsAutomaticRotation();
  private exifTransform: ExifTransform = {rotate: 0, flip: false};
  private setImageMaxSizeRetries = 0;
  private cropperScaledMinWidth = 20;
  private cropperScaledMinHeight = 20;


  safeImgDataUrl: SafeUrl | string | undefined;
  safeTransformStyle: SafeStyle | string | undefined;
  maxSize!: Dimensions;
  imageVisible = false;
  marginLeft: SafeStyle | string = '0px';

  @ViewChild('sourceImage', {static: false}) sourceImage: ElementRef ={} as ElementRef;
  @Input() format: 'png' | 'jpeg' | 'bmp' | 'webp' | 'ico' = 'png';
  @Input() backgroundColor: string | undefined;
  @Input() canvasRotation = 0;
  @Input() imageChangedEvent: any;
  @Input() aspectRatio = 1;
  @Input() containWithinAspectRatio = false;
  @Input() transform: ImageTransform = {};
  @Input() maintainAspectRatio = true;
  @Input() cropperMinWidth = 0;
  @Input() cropperMinHeight = 0;
  @Input() cropperStaticWidth = 0;
  @Input() cropperStaticHeight = 0;
  @Input() resizeToWidth = 0;
  @Input() resizeToHeight = 0;
  @Input() imageQuality = 92;
  @Input() cropper: CropperPosition = {
      x1: -100,
      y1: -100,
      x2: 10000,
      y2: 10000
  };
  @Input() autoCrop = true;
  @Input() onlyScaleDown = false;

  @Output() loadImageFailed = new EventEmitter<void>();
  @Output() imageLoaded = new EventEmitter<void>();
  @Output() cropperReady = new EventEmitter<Dimensions>();
  @Output() startCropImage = new EventEmitter<void>();
  @Output() imageCropped = new EventEmitter<ImageCroppedEvent>();
  constructor(private sanitizer: DomSanitizer,
    private cd: ChangeDetectorRef) {
      this.initCropper();
     }

  ngOnInit(): void {

  }
  ngOnChanges(changes: any): void {
      this.onChangesInputImage(changes);
      if (changes.transform) {
        this.transform = this.transform || {};
        this.setCssTransform();
        this.doAutoCrop();
    }
  }
  private setCssTransform() {
    this.safeTransformStyle = this.sanitizer.bypassSecurityTrustStyle(
        'scaleX(' + (this.transform.scale || 1) * (this.transform.flipH ? -1 : 1) + ')' +
        'scaleY(' + (this.transform.scale || 1) * (this.transform.flipV ? -1 : 1) + ')' +
        'rotate(' + (this.transform.rotate || 0) + 'deg)'
    );
}
  imageLoadedInView(): void {
    if (this.transformedImage != null) {
        this.imageLoaded.emit();
        this.setImageMaxSizeRetries = 0;
        setTimeout(() => this.checkImageMaxSizeRecursively());
    }
}
  private onChangesInputImage(changes: any) {
    if (changes.imageChangedEvent) {
        this.initCropper();
    }
    if (changes.imageChangedEvent && this.isValidImageChangedEvent()) {
      this.loadImageFile(this.imageChangedEvent.target.files[0]);
  }
  }

  private checkImageMaxSizeRecursively(): void {
    if (this.setImageMaxSizeRetries > 40) {
        this.loadImageFailed.emit();
    } else if (this.sourceImageLoaded()) {
        this.setMaxSize();
        this.setCropperScaledMinSize();
        this.resetCropperPosition();
        this.cropperReady.emit({...this.maxSize});
        this.cd.markForCheck();
    } else {
        this.setImageMaxSizeRetries++;
        setTimeout(() => this.checkImageMaxSizeRecursively(), 50);
    }
}
resetCropperPosition(): void {
  const sourceImageElement = this.sourceImage.nativeElement;
  if (this.cropperStaticHeight && this.cropperStaticWidth) {
      this.cropper.x1 = 0;
      this.cropper.x2 = sourceImageElement.offsetWidth > this.cropperStaticWidth ?
          this.cropperStaticWidth : sourceImageElement.offsetWidth;
      this.cropper.y1 = 0;
      this.cropper.y2 = sourceImageElement.offsetHeight > this.cropperStaticHeight ?
          this.cropperStaticHeight : sourceImageElement.offsetHeight;
  } else {
      if (!this.maintainAspectRatio) {
          this.cropper.x1 = 0;
          this.cropper.x2 = sourceImageElement.offsetWidth;
          this.cropper.y1 = 0;
          this.cropper.y2 = sourceImageElement.offsetHeight;
      } else if (sourceImageElement.offsetWidth / this.aspectRatio < sourceImageElement.offsetHeight) {
          this.cropper.x1 = 0;
          this.cropper.x2 = sourceImageElement.offsetWidth;
          const cropperHeight = sourceImageElement.offsetWidth / this.aspectRatio;
          this.cropper.y1 = (sourceImageElement.offsetHeight - cropperHeight) / 2;
          this.cropper.y2 = this.cropper.y1 + cropperHeight;
      } else {
          this.cropper.y1 = 0;
          this.cropper.y2 = sourceImageElement.offsetHeight;
          const cropperWidth = sourceImageElement.offsetHeight * this.aspectRatio;
          this.cropper.x1 = (sourceImageElement.offsetWidth - cropperWidth) / 2;
          this.cropper.x2 = this.cropper.x1 + cropperWidth;
      }
  }
 this.doAutoCrop();
  this.imageVisible = true;
}
private setCropperScaledMinSize(): void {
  if (this.transformedImage) {
      this.setCropperScaledMinWidth();
      this.setCropperScaledMinHeight();
  } else {
      this.cropperScaledMinWidth = 20;
      this.cropperScaledMinHeight = 20;
  }
}
private setCropperScaledMinHeight(): void {
  if (this.maintainAspectRatio) {
      this.cropperScaledMinHeight = Math.max(20, this.cropperScaledMinWidth / this.aspectRatio);
  } else if (this.cropperMinHeight > 0) {
      this.cropperScaledMinHeight = Math.max(20, this.cropperMinHeight / this.transformedImage.height * this.maxSize.height);
  } else {
      this.cropperScaledMinHeight = 20;
  }
}
private setCropperScaledMinWidth(): void {
  this.cropperScaledMinWidth = this.cropperMinWidth > 0
      ? Math.max(20, this.cropperMinWidth / this.transformedImage.width * this.maxSize.width)
      : 20;
}
private setMaxSize(): void {
  if (this.sourceImage) {
      const sourceImageElement = this.sourceImage.nativeElement;
      this.maxSize.width = sourceImageElement.offsetWidth;
      this.maxSize.height = sourceImageElement.offsetHeight;
      this.marginLeft = this.sanitizer.bypassSecurityTrustStyle('calc(50% - ' + this.maxSize.width / 2 + 'px)');
  }
}
private sourceImageLoaded(): boolean {
  return this.sourceImage && this.sourceImage.nativeElement && this.sourceImage.nativeElement.offsetWidth > 0;
}
  private isValidImageChangedEvent(): boolean {
    return this.imageChangedEvent
        && this.imageChangedEvent.target
        && this.imageChangedEvent.target.files
        && this.imageChangedEvent.target.files.length > 0;
}
private loadImageFile(file: File): void {
  const fileReader = new FileReader();
  fileReader.onload = (event: any) => this.loadImage(event.target.result, file.type);
  fileReader.readAsDataURL(file);
}

private loadImage(imageBase64: string, imageType: string) {
  if (this.isValidImageType(imageType)) {
      this.loadBase64Image(imageBase64);
  } else {
      this.loadImageFailed.emit();
  }
}
private loadBase64Image(imageBase64: string): void {
  this.autoRotateSupported
      .then((supported: boolean) => this.checkExifAndLoadBase64Image(imageBase64, supported))
      .then(() => this.transformOriginalImage())
      .catch((error) => {
          this.loadImageFailed.emit();
          this.originalImage = new HTMLImageElement();
          this.originalBase64 = '';
          console.error(error);
      });
}
private isValidImageType(type: string): boolean {
  return /image\/(png|jpg|jpeg|bmp|gif|tiff|webp)/.test(type);
}
  private initCropper(): void {
    this.imageVisible = false;
    this.transformedImage = {} as HTMLImageElement;
    this.safeImgDataUrl = 'data:image/png;base64,iVBORw0KGg'
        + 'oAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAU'
        + 'AAarVyFEAAAAASUVORK5CYII=';
    this.moveStart = {
        active: false,
        type: null,
        position: null,
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        clientX: 0,
        clientY: 0
    };
    this.maxSize = {
        width: 0,
        height: 0
    };
    this.originalSize = {
        width: 0,
        height: 0
    };
    this.transformedSize = {
        width: 0,
        height: 0
    };
    this.cropper.x1 = -100;
    this.cropper.y1 = -100;
    this.cropper.x2 = 10000;
    this.cropper.y2 = 10000;
}
private checkExifAndLoadBase64Image(imageBase64: string, autoRotateSupported: boolean): Promise<void> {
  return new Promise<void>((resolve, reject) => {
      this.originalImage = new Image();
      this.originalImage.onload = () => {
          this.originalBase64 = imageBase64;
          this.exifTransform = getTransformationsFromExifData(autoRotateSupported ? -1 : imageBase64);
          this.originalSize.width = this.originalImage.naturalWidth;
          this.originalSize.height = this.originalImage.naturalHeight;
          resolve();
      };
      this.originalImage.onerror = reject;
      this.originalImage.src = imageBase64;
  });
}
private transformOriginalImage(): Promise<void> {
  if (!this.originalImage || !this.originalImage.complete || !this.exifTransform) {
      return Promise.reject(new Error('No image loaded'));
  }
  const transformedBase64 = this.transformImageBase64();
  return this.setTransformedImage(transformedBase64);
}
private transformImageBase64(): string {
  const canvasRotation = this.canvasRotation + this.exifTransform.rotate;
  if (canvasRotation === 0 && !this.exifTransform.flip && !this.containWithinAspectRatio) {
      return this.originalBase64;
  }

  const transformedSize = this.getTransformedSize();
  const canvas = document.createElement('canvas');
  canvas.width = transformedSize.width;
  canvas.height = transformedSize.height;
  const ctx:any = canvas.getContext('2d');
  ctx.setTransform(
      this.exifTransform.flip ? -1 : 1,
      0,
      0,
      1,
      canvas.width / 2,
      canvas.height / 2
  );
  ctx.rotate(Math.PI * (canvasRotation / 2));
  ctx.drawImage(
      this.originalImage,
      -this.originalSize.width / 2,
      -this.originalSize.height / 2
  );
  return canvas.toDataURL();
}
private setTransformedImage(transformedBase64:any): Promise<void> {
  return new Promise<void>((resolve) => {
      this.transformedBase64 = transformedBase64;
      this.safeImgDataUrl = this.sanitizer.bypassSecurityTrustResourceUrl(transformedBase64);
      this.transformedImage = new Image();
      this.transformedImage.onload = () => {
          this.transformedSize.width = this.transformedImage.naturalWidth;
          this.transformedSize.height = this.transformedImage.naturalHeight;
          this.cd.markForCheck();
          resolve();
      };
      this.transformedImage.src = this.transformedBase64;
  });
}
private getTransformedSize(): Dimensions {
  const canvasRotation = this.canvasRotation + this.exifTransform.rotate;
  if (this.containWithinAspectRatio) {
      if (canvasRotation % 2) {
          const minWidthToContain = this.originalSize.width * this.aspectRatio;
          const minHeightToContain = this.originalSize.height / this.aspectRatio;
          return {
              width: Math.max(this.originalSize.height, minWidthToContain),
              height: Math.max(this.originalSize.width, minHeightToContain),
          };
      } else {
          const minWidthToContain = this.originalSize.height * this.aspectRatio;
          const minHeightToContain = this.originalSize.width / this.aspectRatio;
          return {
              width: Math.max(this.originalSize.width, minWidthToContain),
              height: Math.max(this.originalSize.height, minHeightToContain),
          };
      }
  }

  if (canvasRotation % 2) {
      return {
          height: this.originalSize.width,
          width: this.originalSize.height,
      };
  }
  return {
      width: this.originalSize.width,
      height: this.originalSize.height,
  };
}
private doAutoCrop(): void {
  if (this.autoCrop) {
      this.crop();
  }
}
crop(): ImageCroppedEvent | null {
  if (this.sourceImage && this.sourceImage.nativeElement && this.transformedImage != null) {
      this.startCropImage.emit();
      const imagePosition = this.getImagePosition();
      const width = imagePosition.x2 - imagePosition.x1;
      const height = imagePosition.y2 - imagePosition.y1;

      const cropCanvas = document.createElement('canvas') as HTMLCanvasElement;
      cropCanvas.width = width;
      cropCanvas.height = height;

      const ctx = cropCanvas.getContext('2d');
      if (ctx) {
          if (this.backgroundColor != null) {
              ctx.fillStyle = this.backgroundColor;
              ctx.fillRect(0, 0, width, height);
          }

          const scaleX = (this.transform.scale || 1) * (this.transform.flipH ? -1 : 1);
          const scaleY = (this.transform.scale || 1) * (this.transform.flipV ? -1 : 1);

          ctx.setTransform(scaleX, 0, 0, scaleY, this.transformedSize.width / 2, this.transformedSize.height / 2);
          ctx.translate(-imagePosition.x1 / scaleX, -imagePosition.y1 / scaleY);
          ctx.rotate((this.transform.rotate || 0) * Math.PI / 180);
          ctx.drawImage(this.transformedImage, -this.transformedSize.width / 2, -this.transformedSize.height / 2);

          const output: ImageCroppedEvent = {
              width, height,
              imagePosition,
              cropperPosition: {...this.cropper}
          };
          if (this.containWithinAspectRatio) {
              output.offsetImagePosition = this.getOffsetImagePosition();
          }
          const resizeRatio = this.getResizeRatio(width, height);
          if (resizeRatio !== 1) {
              output.width = Math.round(width * resizeRatio);
              output.height = this.maintainAspectRatio
                  ? Math.round(output.width / this.aspectRatio)
                  : Math.round(height * resizeRatio);
              resizeCanvas(cropCanvas, output.width, output.height);
          }
          output.base64 = this.cropToBase64(cropCanvas);
          this.imageCropped.emit(output);
          return output;
      }
  }
  return null;
}
private cropToBase64(cropCanvas: HTMLCanvasElement): string {
  return cropCanvas.toDataURL('image/' + this.format, this.getQuality());
}
getResizeRatio(width: number, height: number): number {
  const ratioWidth = this.resizeToWidth / width;
  const ratioHeight = this.resizeToHeight / height;
  const ratios = new Array<number>();

  if (this.resizeToWidth > 0) {
      ratios.push(ratioWidth);
  }
  if (this.resizeToHeight > 0) {
      ratios.push(ratioHeight);
  }

  const result = ratios.length === 0 ? 1 : Math.min(...ratios);

  if (result > 1 && !this.onlyScaleDown) {
      return result;
  }
  return Math.min(result, 1);
}

private getOffsetImagePosition(): CropperPosition {
  const canvasRotation = this.canvasRotation + this.exifTransform.rotate;
  const sourceImageElement = this.sourceImage.nativeElement;
  const ratio = this.transformedSize.width / sourceImageElement.offsetWidth;
  let offsetX: number;
  let offsetY: number;

  if (canvasRotation % 2) {
      offsetX = (this.transformedSize.width - this.originalSize.height) / 2;
      offsetY = (this.transformedSize.height - this.originalSize.width) / 2;
  } else {
      offsetX = (this.transformedSize.width - this.originalSize.width) / 2;
      offsetY = (this.transformedSize.height - this.originalSize.height) / 2;
  }

  const out: CropperPosition = {
      x1: Math.round(this.cropper.x1 * ratio) - offsetX,
      y1: Math.round(this.cropper.y1 * ratio) - offsetY,
      x2: Math.round(this.cropper.x2 * ratio) - offsetX,
      y2: Math.round(this.cropper.y2 * ratio) - offsetY
  };

  if (!this.containWithinAspectRatio) {
      out.x1 = Math.max(out.x1, 0);
      out.y1 = Math.max(out.y1, 0);
      out.x2 = Math.min(out.x2, this.transformedSize.width);
      out.y2 = Math.min(out.y2, this.transformedSize.height);
  }

  return out;
}
private getImagePosition(): CropperPosition {
  const sourceImageElement = this.sourceImage.nativeElement;
  const ratio = this.transformedSize.width / sourceImageElement.offsetWidth;

  const out: CropperPosition = {
      x1: Math.round(this.cropper.x1 * ratio),
      y1: Math.round(this.cropper.y1 * ratio),
      x2: Math.round(this.cropper.x2 * ratio),
      y2: Math.round(this.cropper.y2 * ratio)
  };

  if (!this.containWithinAspectRatio) {
      out.x1 = Math.max(out.x1, 0);
      out.y1 = Math.max(out.y1, 0);
      out.x2 = Math.min(out.x2, this.transformedSize.width);
      out.y2 = Math.min(out.y2, this.transformedSize.height);
  }

  return out;
}
private getQuality(): number {
  return Math.min(1, Math.max(0, this.imageQuality / 100));
}

}
