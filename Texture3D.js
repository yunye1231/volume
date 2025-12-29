function Texture3D(options) {
    options = Cesium.defaultValue(options, Cesium.defaultValue.EMPTY_OBJECT);
    Cesium.Check.defined("options.context", options.context);

    const context = options.context;
    const gl = context._gl;

    if (!context.webgl2) {
        throw new Cesium.DeveloperError("Texture3D requires a WebGL 2.0 context.");
    }

    const width = Cesium.defaultValue(options.width, 0);
    const height = Cesium.defaultValue(options.height, 0);
    const depth = Cesium.defaultValue(options.depth, 0);
    const source = options.source;

    Cesium.Check.typeOf.number.greaterThan("width", width, 0);
    Cesium.Check.typeOf.number.greaterThan("height", height, 0);
    Cesium.Check.typeOf.number.greaterThan("depth", depth, 0);

    if (width > Cesium.ContextLimits.maximumTextureSize ||
        height > Cesium.ContextLimits.maximumTextureSize ||
        depth > Cesium.ContextLimits.maximumTextureSize) {
        throw new Cesium.DeveloperError("Texture dimensions exceed maximum texture size.");
    }

    const pixelFormat = Cesium.defaultValue(options.pixelFormat, Cesium.PixelFormat.RED);
    const pixelDatatype = Cesium.defaultValue(options.pixelDatatype, Cesium.PixelDatatype.UNSIGNED_BYTE);

    if (!Cesium.PixelFormat.validate(pixelFormat)) {
        throw new Cesium.DeveloperError("Invalid options.pixelFormat.");
    }
    if (!Cesium.PixelDatatype.validate(pixelDatatype)) {
        throw new Cesium.DeveloperError("Invalid options.pixelDatatype.");
    }

    // === ✨ 自动设置 internalFormat（兼容 FLOAT/UNSIGNED_BYTE 等） ===
    let internalFormat;
    if (pixelFormat === gl.RED) {
        if (pixelDatatype === gl.FLOAT) {
            internalFormat = gl.R32F;
        } else if (pixelDatatype === gl.UNSIGNED_BYTE) {
            internalFormat = gl.R8;
        } else {
            throw new Cesium.DeveloperError("Unsupported RED format + datatype combination.");
        }
    } else {
        // 可扩展支持更多格式组合
        internalFormat = gl.R8; // 默认
    }

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, texture);

    // 设置 UNPACK 参数
    let unpackAlignment = 4;
    if (Cesium.defined(source?.arrayBufferView)) {
        unpackAlignment = Cesium.PixelFormat.alignmentInBytes(pixelFormat, pixelDatatype, width);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, unpackAlignment);
    }

    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, options.flipY === true);

    const webglPixelDatatype = Cesium.PixelDatatype.toWebGLConstant(pixelDatatype, context);

    // === 分配并上传纹理数据 ===
    if (Cesium.defined(source?.arrayBufferView)) {
        gl.texImage3D(gl.TEXTURE_3D, 0, internalFormat, width, height, depth, 0, pixelFormat, webglPixelDatatype, source.arrayBufferView);
    } else {
        gl.texImage3D(gl.TEXTURE_3D, 0, internalFormat, width, height, depth, 0, pixelFormat, webglPixelDatatype, null);
    }

    // 默认采样器设置
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);


    gl.bindTexture(gl.TEXTURE_3D, null);

    // === 成员属性 ===
    this._id = Cesium.createGuid();
    this._context = context;
    this._textureTarget = gl.TEXTURE_3D;
    this._texture = texture;
    this._internalFormat = internalFormat;
    this._pixelFormat = pixelFormat;
    this._pixelDatatype = pixelDatatype;
    this._width = width;
    this._height = height;
    this._depth = depth;
    this._dimensions = new Cesium.Cartesian3(width, height, depth);
    this._hasMipmap = false;
    this._preMultiplyAlpha = false;
    this._flipY = options.flipY === true;
    this._initialized = true;
    this._sampler = undefined;
    this._sizeInBytes = Cesium.defined(source?.arrayBufferView) ? source.arrayBufferView.byteLength : 0;

    this.sampler = Cesium.defined(options.sampler) ? options.sampler : new Cesium.Sampler();
}

Object.defineProperties(Texture3D.prototype, {
    id: { get: function () { return this._id; } },
    sampler: {
        get: function () {
            return this._sampler;
        },
        set: function (sampler) {
            const gl = this._context._gl;
            const target = this._textureTarget;

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(target, this._texture);

            gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, sampler.minificationFilter || gl.LINEAR);
            gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, sampler.magnificationFilter || gl.LINEAR);
            gl.texParameteri(target, gl.TEXTURE_WRAP_S, sampler.wrapS || gl.CLAMP_TO_EDGE);
            gl.texParameteri(target, gl.TEXTURE_WRAP_T, sampler.wrapT || gl.CLAMP_TO_EDGE);
            gl.texParameteri(target, gl.TEXTURE_WRAP_R, sampler.wrapR || gl.CLAMP_TO_EDGE);

            gl.bindTexture(target, null);
            this._sampler = sampler;
        }
    },
    dimensions: { get: function () { return this._dimensions; } },
    width: { get: function () { return this._width; } },
    height: { get: function () { return this._height; } },
    depth: { get: function () { return this._depth; } },
    pixelFormat: { get: function () { return this._pixelFormat; } },
    pixelDatatype: { get: function () { return this._pixelDatatype; } },
    _target: { get: function () { return this._textureTarget; } }
});

Texture3D.prototype.isDestroyed = function () {
    return false;
};

Texture3D.prototype.destroy = function () {
    this._context._gl.deleteTexture(this._texture);
    return Cesium.destroyObject(this);
};

Texture3D.fromFramebuffer = function (options) {
    throw new Cesium.DeveloperError("Texture3D.fromFramebuffer is not implemented in this version.");
};
