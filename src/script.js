var o; // and so it is

(function( element, window ) {

var rsrc = /url\(["']?(.*?)["']?\)/,
	rprespace = /^\s\s*/,
	rpostspace = /\s\s*$/,
	rmidspace = /\s\s*/g,
	rpercent = /%$/,
	positions = {
		top: 0,
		left: 0,
		bottom: 1,
		right: 1,
		center: 0.5
	},
	doc = element.document,
	spacer = "data:image/gif;base64,R0lGODlhAQABAIABAP///wAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
	wrapperClass = "background-size-polyfill",
	noop = function() {},
	resizeInterval = 100,
	resizeId,
	processSnapshotId,
	updateEventId,
	updateBackgroundCallbackId;

// remove the background-image and emulate it with a wrapped <img/>
function init() {
	var wrapper = doc.createElement( "div" ),
		img = doc.createElement( "img" ),
		wrapperStyle = wrapper.style,
		elementStyle = element.style,
		elementCurrentStyle = element.currentStyle,
		expando = element.bgsExpando,
		cloneWrapper = element.firstChild;

	if ( expando ) {
		if ( expando.restore ) {
			elementStyle.backgroundImage = expando.restore.backgroundImage;
			elementStyle.position = expando.restore.position;
			elementStyle.zIndex = expando.restore.zIndex;
		}

		if ( cloneWrapper &&
				( cloneWrapper.nodeName || "" ).toUpperCase() === "DIV" &&
				cloneWrapper.className === wrapperClass) {
			element.removeChild( cloneWrapper );
		}
	}

	setStyles( wrapper );
	wrapper.className = wrapperClass;
	wrapperStyle.top =
		wrapperStyle.right =
		wrapperStyle.bottom =
		wrapperStyle.left = 0;

	setStyles( img );
	img.alt = "";

	wrapper.appendChild( img );

	element.insertBefore( wrapper, element.firstChild );

	// save useful data for quick access
	element.bgsExpando = expando = {
		wrapper: wrapper,
		img: img,
		// styles to restore on detach
		restore: {
			backgroundImage: elementStyle.backgroundImage,
			position: elementStyle.position,
			zIndex: elementStyle.zIndex
		},
		current: {},       // current snapshot
		next: null,        // next snapshot to process
		processing: false, // whether we are in the middle of processing the next snapshot
		loadImg: null,     // temp img element/object from getImageDimensions
		display: false,    // element's display property
		changed: false,    // whether element's display property has changed
		ignore: false      // whether to ignore the next property change event
	};

	// This is the part where we mess with the existing DOM
	// to make sure that the background image is correctly zIndexed
	if ( elementCurrentStyle.zIndex === "auto" ) {
		elementStyle.zIndex = 0;
	}
	if ( elementCurrentStyle.position === "static" ) {
		elementStyle.position = "relative";
	}

	// allow init() to be called only once
	o.init = noop;

	// check if browser supports our data uri spacer gif
	getImageDimensions( expando, spacer, function( width, height ) {
		if ( width !== 1 || height !== 1 ) {
			spacer = window.bgsSpacerGif;
		}

		o = {
			init: noop,
			handlePropertychange: handlePropertychange,
			restore: restore,
			handleResize: handleResize
		};

		handlePropertychange();
	} );
}

function setStyles( el ) {
	var style = el.style;

	style.position = "absolute";
	style.display = "block";
	style.zIndex = -1;
	style.overflow = "hidden";
	style.visibility = "inherit";
	style.width =
		style.height =
		style.top =
		style.right =
		style.bottom =
		style.left =
		style.cursor = "auto";
	style.margin =
		style.padding =
		style.border =
		style.outline =
		style.minWidth =
		style.minHeight = 0;
	style.background =
		style.maxWidth =
		style.maxHeight = "none";
	style.fontSize =
		style.lineHeight = "1em";
}

function getImageDimensions( expando, src, callback ) {
	var img;

	if ( src ) {
		img = doc.createElement( "img" );
		img.onload = img.onerror = function() {
			var width = this.width,
				height = this.height;
			if ( window.event.type === "error" ) {
				width = height = 0;
			}
			expando.loadImg = this.onload = this.onerror = null;
			callback( width, height );
		};
		img.src = src;

	} else {
		img = {
			callbackId: window.setTimeout( function() {
				expando.loadImg = null;
				callback( 0, 0 );
			}, 0 )
		};
	}

	expando.loadImg = img;
	img = null;
}

// this prevents handling propertychange events caused by this script
function suspendPropertychange( callback ) {
	var fn = o.handlePropertychange;
	o.handlePropertychange = noop;
	callback();
	o.handlePropertychange = fn;
}

function refreshDisplay( element, expando ) {
	var display = element.currentStyle.display;

	if ( display !== expando.display ) {
		expando.display = display;
		expando.changed = true;
	}

	return display !== "none";
}

function takeSnapshot( element, expando ) {
	var elementStyle = element.style,
		elementCurrentStyle = element.currentStyle,
		expandoRestore = expando.restore,
		size = normalizeCSSValue( elementCurrentStyle["background-size"] ),
		sizeList = size.split( " " ),
		pos = [
			elementCurrentStyle.backgroundPositionX,
			elementCurrentStyle.backgroundPositionY
		],
		snapshot = {
			innerWidth: element.offsetWidth -
				( parseFloat( elementCurrentStyle.borderLeftWidth ) || 0 ) -
				( parseFloat( elementCurrentStyle.borderRightWidth ) || 0 ),
			innerHeight: element.offsetHeight -
				( parseFloat( elementCurrentStyle.borderTopWidth ) || 0 ) -
				( parseFloat( elementCurrentStyle.borderBottomWidth ) || 0 ),
			size: size,
			sizeIsKeyword: size === "contain" || size === "cover",
			sizeX: sizeList[0],
			sizeY: sizeList.length > 1 ? sizeList[1] : "auto",
			// Only keywords or percentage values are supported
			posX: positions[ pos[0] ] || parseFloat( pos[0] ) / 100 || 0,
			posY: positions[ pos[1] ] || parseFloat( pos[1] ) / 100 || 0,
			src: "",
			imgWidth: 0,
			imgHeight: 0
		};

	if ( !snapshot.sizeIsKeyword ) {
		// negative lengths or percentages are not allowed
		if ( !( ( parseFloat( snapshot.sizeX ) >= 0 || snapshot.sizeX === "auto" ) &&
				( parseFloat( snapshot.sizeY ) >= 0 || snapshot.sizeY === "auto" ) ) ) {
			snapshot.sizeX = snapshot.sizeY = "auto";
		}

		// percentages are relative to the element, not image, width/height
		if ( rpercent.test( snapshot.sizeX ) ) {
			snapshot.sizeX = ( snapshot.innerWidth * parseFloat( snapshot.sizeX ) / 100 || 0 ) + "px";
		}
		if ( rpercent.test( snapshot.sizeY ) ) {
			snapshot.sizeY = ( snapshot.innerHeight * parseFloat( snapshot.sizeY ) / 100 || 0 ) + "px";
		}
	}

	if ( ( rsrc.exec( elementStyle.backgroundImage ) || [] )[1] === spacer ) {
		suspendPropertychange( function() {
			elementStyle.backgroundImage = expandoRestore.backgroundImage;
		} );
	} else {
		expandoRestore.backgroundImage = elementStyle.backgroundImage;
	}

	snapshot.src = ( rsrc.exec( elementCurrentStyle.backgroundImage ) || [] )[1];

	suspendPropertychange( function() {
		elementStyle.backgroundImage = "url(" + spacer + ")";
	} );

	return snapshot;
}

function normalizeCSSValue( value ) {
	return String( value ).replace( rprespace, "" ).replace( rpostspace, "" ).replace( rmidspace, " " );
}

function processSnapshot( element, expando ) {
	var snapshot = expando.next;

	function loop() {
		processSnapshotId = window.setTimeout( function() {
			expando.processing = false;
			processSnapshot( element, expando );
		}, 0 );
	}

	if ( !expando.processing && snapshot ) {
		expando.next = null;
		expando.processing = true;

		getImageDimensions( expando, snapshot.src, function( width, height ) {
			snapshot.imgWidth = width;
			snapshot.imgHeight = height;

			if ( isChanged( expando, snapshot ) ) {
				updateBackground( element, expando, snapshot, loop );
			} else {
				loop();
			}
		} );
	}
}

function isChanged( expando, snapshot ) {
	var expandoCurrent = expando.current,
		changed = false,
		prop;

	if ( expando.changed ) {
		// display changed
		expando.changed = false;
		changed = true;

	} else {
		for ( prop in snapshot ) {
			if ( snapshot[prop] !== expandoCurrent[prop] ) {
				changed = true;
				break;
			}
		}
	}

	return changed;
}

function updateBackground( element, expando, snapshot, callback ) {
	var img = expando.img,
		imgStyle = img.style,
		size = snapshot.size,
		innerWidth = snapshot.innerWidth,
		innerHeight = snapshot.innerHeight,
		imgWidth = snapshot.imgWidth,
		imgHeight = snapshot.imgHeight,
		posX = snapshot.posX,
		posY = snapshot.posY,
		display = "none",
		left = 0,
		top = 0,
		width = "auto",
		height = "auto",
		px = "px",
		oneHundredPercent = "100%",
		elemRatio,
		imgRatio,
		delta;

	if ( innerWidth && innerHeight && imgWidth && imgHeight ) {
		img.src = snapshot.src;

		if ( snapshot.sizeIsKeyword ) {
			elemRatio = innerWidth / innerHeight;
			imgRatio = imgWidth / imgHeight;

			// this will always floor towards zero
			// can we just do Math.round()?

			if ( size === "contain" ) {
				if ( imgRatio > elemRatio ) {
					delta = Math.floor( ( innerHeight - innerWidth / imgRatio ) * posY );

					top = delta + px;
					width = oneHundredPercent;

				// elemRatio > imgRatio
				} else {
					delta = Math.floor( ( innerWidth - innerHeight * imgRatio ) * posX );

					left = delta + px;
					height = oneHundredPercent;
				}

			// size === "cover"
			} else {
				if ( imgRatio > elemRatio ) {
					delta = Math.floor( ( innerHeight * imgRatio - innerWidth ) * posX );

					left = -delta + px;
					height = oneHundredPercent;

				// elemRatio > imgRatio
				} else {
					delta = Math.floor( ( innerWidth / imgRatio - innerHeight ) * posY );

					top = -delta + px;
					width = oneHundredPercent;
				}
			}

			imgStyle.left = left;
			imgStyle.top = top;
			imgStyle.width = width;
			imgStyle.height = height;

			display = "block";

		} else {
			// need to set width/height then calculate left/top from the actual width/height
			imgStyle.display = "block";
			imgStyle.width = snapshot.sizeX;
			imgStyle.height = snapshot.sizeY;

			imgWidth = img.width;
			imgHeight = img.height;

			if ( imgWidth && imgHeight ) {
				// flooring towards zero again

				if ( imgWidth < innerWidth ) {
					delta = Math.floor( ( innerWidth - imgWidth ) * posX );

					left = delta + px;

				} else {
					delta = Math.floor( ( imgWidth - innerWidth ) * posX );

					left = -delta + px;
				}

				if ( imgHeight < innerHeight ) {
					delta = Math.floor( ( innerHeight - imgHeight ) * posY );

					top = delta + px;

				} else {
					delta = Math.floor( ( imgHeight - innerHeight ) * posY );

					top = -delta + px;
				}

				imgStyle.left = left;
				imgStyle.top = top;

				display = "block";
			}
		}
	}

	imgStyle.display = display;

	expando.current = snapshot;

	// img onload may be called synchronously, leading to us trying to
	// fire onbackgroundupdate within init(), causing an error
	// so wrap it with setTimeout()
	updateEventId = window.setTimeout( function() {
		updateBackgroundCallbackId = window.setTimeout( callback, 0 );

		// if any properties are changed here, processSnapshot() will process them later
		// if ondetach is triggered, updateBackgroundCallbackId will be cleared
		updateEvent.fire();
	}, 0 );
}

// handle different style changes
function handlePropertychange() {
	var expando = element.bgsExpando,
		propertyName = ( window.event || {} ).propertyName,
		backgroundImageProperty = "style.backgroundImage";

	if ( expando.ignore ) {
		expando.ignore = false;
		if ( propertyName === backgroundImageProperty ) {
			return;
		}
	}

	// if the changed property is style.backgroundImage
	// and its value is set to a non-empty string,
	// then the propertychange event will be fired twice
	// http://blog.csdn.net/hax/article/details/1346542
	if ( propertyName === backgroundImageProperty && element.style.backgroundImage ) {
		expando.ignore = true;
	}

	if ( refreshDisplay( element, expando ) ) {
		// since each snapshot includes changes all previous snapshots,
		// we can replace the old next snapshot with a new one
		expando.next = takeSnapshot( element, expando );
		processSnapshot( element, expando );
	}
}

function handleResize() {
	window.clearTimeout( resizeId );
	resizeId = window.setTimeout( handlePropertychange, resizeInterval );
}

function restore() {
	var expando = element.bgsExpando,
		loadImg,
		elementStyle,
		expandoRestore;

	o = {
		init: noop,
		handlePropertychange: noop,
		restore: noop,
		handleResize: noop
	};

	window.clearTimeout( resizeId );
	window.clearTimeout( processSnapshotId );
	window.clearTimeout( updateEventId );
	window.clearTimeout( updateBackgroundCallbackId );

	try {
		if ( expando ) {
			loadImg = expando.loadImg;
			if ( loadImg ) {
				loadImg.onload = loadImg.onerror = null;
				window.clearTimeout( loadImg.callbackId );
			}

			elementStyle = element.style;
			expandoRestore = expando.restore;
			if ( elementStyle ) {
				elementStyle.backgroundImage = expandoRestore.backgroundImage;
				elementStyle.position = expandoRestore.position;
				elementStyle.zIndex = expandoRestore.zIndex;
			}

			element.removeChild( expando.wrapper );
		}

		element.bgsExpando = null;

	} catch ( e ) {}

	element = window = doc = noop = null;
}

// don't allow anything until init() is called
// IE seems to think it needs to attach the behavior a second time for printing
o = {
	init: doc.media !== "print" ? init : noop,
	handlePropertychange: noop,
	restore: noop,
	handleResize: noop
};

if ( element.readyState === "complete" ) {
	o.init();
}

})( element, window );
