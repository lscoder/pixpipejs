/*
* Author   Jonathan Lurie - http://me.jonahanlurie.fr
* License  MIT
* Link      https://github.com/jonathanlurie/pixpipejs
* Lab       MCIN - Montreal Neurological Institute
*/

import { Image3D } from './Image3D.js';
import { Image2D } from './Image2D.js';

/**
* MniVolume instance are like Image3D but include
*/
class MniVolume extends Image3D{


  /**
  * Constructor of an Image3D instance. If no options, no array is allocated.
  * @param {Object} options - if present, must have options.xSize, options.ySize, option.zSize.
  * Also options.ncpp to set the number of components per pixel. (possibly for using time series)
  */
  constructor( options=null ){
    super();
  }


  /**
  * Initialize a MniVolume with the data and the header.
  * @param {Array} data - TypedArray containing the data
  */
  setData( data, header ){
    var that = this;
    this._data = data;

    this.setMetadata( "position", {} );
    this.setMetadata( "current_time", 0 );

    // copying header into metadata
    var headerKeys = Object.keys(header);
    headerKeys.forEach( function(key){
      that.setMetadata( key, header[key] );
    })

    // find min/max
    this._scanDataRange();

    // set W2v matrix
    this._saveOriginAndTransform();

    // adding some fields to metadata header
    this._finishHeader()

    console.log(this._metadata);
    console.log(this._data);


    console.log( this.getIntensityValue(100, 100, 100));
  }


  /**
  * [PRIVATE]
  * Look for min and max on the dataset and add them to the header metadata
  */
  _scanDataRange(){
    var min = +Infinity;
    var max = -Infinity;

    this._data.forEach( function(value){
      min = Math.min(min, value);
      max = Math.max(max, value);
    })

    this.setMetadata("voxel_min", min);
    this.setMetadata("voxel_max", max);
  }


  /**
  * [PRIVATE}
  * Calculate the world to voxel transform and save it, so we
  * can access it efficiently. The transform is:
  * cxx / stepx | cxy / stepx | cxz / stepx | (-o.x * cxx - o.y * cxy - o.z * cxz) / stepx
  * cyx / stepy | cyy / stepy | cyz / stepy | (-o.x * cyx - o.y * cyy - o.z * cyz) / stepy
  * czx / stepz | czy / stepz | czz / stepz | (-o.x * czx - o.y * czy - o.z * czz) / stepz
  * 0           | 0           | 0           | 1
  *
  * Origin equation taken from (http://www.bic.mni.mcgill.ca/software/minc/minc2_format/node4.html)
  */
  _saveOriginAndTransform() {

    var xspace = this.getMetadata("xspace");
    var yspace = this.getMetadata("yspace");
    var zspace = this.getMetadata("zspace");

    var startx = xspace.start;
    var starty = yspace.start;
    var startz = zspace.start;
    var cx = xspace.direction_cosines;
    var cy = yspace.direction_cosines;
    var cz = zspace.direction_cosines;
    var stepx = xspace.step;
    var stepy = yspace.step;
    var stepz = zspace.step;

    // voxel_origin
    var o = {
      x: startx * cx[0] + starty * cy[0] + startz * cz[0],
      y: startx * cx[1] + starty * cy[1] + startz * cz[1],
      z: startx * cx[2] + starty * cy[2] + startz * cz[2]
    };

    this.setMetadata("voxel_origin", o);

    var tx = (-o.x * cx[0] - o.y * cx[1] - o.z * cx[2]) / stepx;
    var ty = (-o.x * cy[0] - o.y * cy[1] - o.z * cy[2]) / stepy;
    var tz = (-o.x * cz[0] - o.y * cz[1] - o.z * cz[2]) / stepz;

    var w2v = [
      [cx[0] / stepx, cx[1] / stepx, cx[2] / stepx, tx],
      [cy[0] / stepy, cy[1] / stepy, cy[2] / stepy, ty],
      [cz[0] / stepz, cz[1] / stepz, cz[2] / stepz, tz]
    ];

    this.setMetadata("w2v", w2v);
  }


  /**
  * [PRIVATE]
  * Creates common fields all headers must contain.
  */
  _finishHeader() {
    var xspace = this.getMetadata("xspace");
    var yspace = this.getMetadata("yspace");
    var zspace = this.getMetadata("zspace");

    xspace.name = "xspace";
    yspace.name = "yspace";
    zspace.name = "zspace";

    xspace.width_space  = yspace;
    xspace.width        = yspace.space_length;
    xspace.height_space = zspace;
    xspace.height       = zspace.space_length;

    yspace.width_space  = xspace;
    yspace.width        = xspace.space_length;
    yspace.height_space = zspace;
    yspace.height       = zspace.space_length;

    zspace.width_space  = xspace;
    zspace.width        = xspace.space_length;
    zspace.height_space = yspace;
    zspace.height       = yspace.space_length;
  }


  /**
  * Get the intensity of a given voxel. The position i j k
  */
  getIntensityValue(i, j, k, time) {
    var order = this.getMetadata("order");
    time = time === undefined ? this.getMetadata( "current_time" ) : time;

    if (i < 0 || i >= this.getMetadata( order[0] ).space_length ||
        j < 0 || j >= this.getMetadata( order[1] ).space_length ||
        k < 0 || k >= this.getMetadata( order[2] ).space_length)
    {
        return 0;
    }

    var time_offset = this.hasMetadata( "time" ) ? time * this.getMetadata( "time" ).offset : 0;

    var xyzt_offset = (
      i * this.getMetadata( order[0] ).offset +
      j * this.getMetadata( order[1] ).offset +
      k * this.getMetadata( order[2] ).offset +
      time_offset);

    return this._data[xyzt_offset];
  }





  /**
  * [PRIVATE]
  * Return a slice from the minc cube as a 1D typed array,
  * along with some relative data (slice size, step, etc.)
  * args:
  * @param {String} axis - "xspace", "yspace" or zspace (mandatory)
  * @param {Number} slice_num - index of the slice [0; length-1] (optional, default: length-1)
  * @param {Number} time - index of time (optional, default: 0)
  * TODO: add some method to a slice (get value) because it's a 1D array... and compare with Python
  */
  slice(axis, slice_num = 0, time = 0) {
    if( !this.hasMetadata(axis) ){
      console.warn("The axis " + axis + " does not exist.");
      return null;
    }

    var time_offset = this.hasMetadata("time") ? time * this.getMetadata("time").offset : 0;

    var axis_space = this.getMetadata(axis);
    var width_space = axis_space.width_space;
    var height_space = axis_space.height_space;

    var width = axis_space.width;
    var height = axis_space.height;

    var axis_space_offset = axis_space.offset;
    var width_space_offset = width_space.offset;
    var height_space_offset = height_space.offset;

    // Calling the volume data's constructor guarantees that the
    // slice data buffer has the same type as the volume.
    //
    //var slice_data = new this._data.constructor(width * height);
    var slice_data = new Float32Array(width * height);


    var slice;

    // Rows and colums of the result slice.
    var row, col;

    // Indexes into the volume, relative to the slice.
    // NOT xspace, yspace, zspace coordinates!!!
    var x, y, z;

    // Linear offsets into volume considering an
    // increasing number of axes: (t) time,
    // (z) z-axis, (y) y-axis, (x) x-axis.
    var tz_offset, tzy_offset, tzyx_offset;

    // Whether the dimension steps positively or negatively.
    var x_positive = width_space.step  > 0;
    var y_positive = height_space.step > 0;
    var z_positive = axis_space.step   > 0;

    // iterator for the result slice.
    var i = 0;
    var intensity = 0;
    var intensitySum = 0;
    var min = Infinity;
    var max = -Infinity;

    var maxOfVolume = this.getMetadata("voxel_max");

    z = z_positive ? slice_num : axis_space.space_length - slice_num - 1;
    if (z >= 0 && z < axis_space.space_length) {
      tz_offset = time_offset + z * axis_space_offset;

      for (row = height - 1; row >= 0; row--) {
        y = y_positive ? row : height - row - 1;
        tzy_offset = tz_offset + y * height_space_offset;

        for (col = 0; col < width; col++) {
          x = x_positive ? col : width - col - 1;
          tzyx_offset = tzy_offset + x * width_space_offset;

          intensity = this._data[tzyx_offset];

          min = Math.min(min, intensity);
          max = Math.max(max, intensity);
          intensitySum += intensity;

          slice_data[i++] = (intensity / maxOfVolume) * 256;

        }
      }
    }

    var outputImage = new Image2D();
    outputImage.setData(  slice_data, width, height, 1)
    return outputImage;

  }



} /* END of class Image3D */

export { MniVolume }