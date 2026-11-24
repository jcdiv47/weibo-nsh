//! The app's own Rust (an nshm in `ext/`, `nsh.json` `"dependencies"`): what TSX imports from
//! `weibo-media`. `PhotoLibrary.save` puts a picture or video the app downloaded into the user's
//! photo library, so "Save to Photos" saves rather than opening the share sheet.
//!
//! iOS only, with the Photos framework: it asks for the add-only level of access, which can add
//! but never read (`NSPhotoLibraryAddUsageDescription`, in the app's `nsh.json`). Elsewhere
//! `available()` is false and the app saves another way (the desktops' Downloads folder) or shares.

use nsh_core::prelude::*;

#[native_module("weibo-media")]
fn native(registry: &mut Registry) {
    registry.module::<PhotoLibrary>();
}

/// The code of a save the user does not allow: they turned off the app's access to Photos, or
/// were asked and said no (Node's `EACCES`). Only the system's settings change it then.
pub const DENIED: &str = "EACCES";

/// Saving into the user's photo library.
#[module]
pub struct PhotoLibrary;

#[module]
impl PhotoLibrary {
    /// Whether `save` puts files into the photo library here: on iOS (not Mac Catalyst).
    pub fn available() -> bool {
        cfg!(all(target_os = "ios", not(target_abi = "macabi")))
    }

    /// Adds the picture (`video` false) or video at `path`, a file of the app's, to the user's
    /// photo library, asking the user the first time. The file stays where it is. Rejects with
    /// `EACCES` when the user does not allow it, and with the system's reason when Photos
    /// refuses the file (not a picture or video it reads).
    pub async fn save(path: String, video: bool) -> Result<(), JsError> {
        blocking(move || platform::save(&path, video))
            .await
            .map_err(|e| JsError::Error(format!("cannot save to Photos: {e}")))?
            .map_err(SaveError::into_js)
    }
}

/// Why a save failed.
#[allow(dead_code)]
enum SaveError {
    /// The user does not let the app add to Photos.
    Denied,
    /// Photos is not here, or refused the file.
    Failed(String),
}

impl SaveError {
    fn into_js(self) -> JsError {
        match self {
            SaveError::Denied => {
                JsError::Error("the app may not add to Photos".to_owned()).with_code(DENIED)
            }
            SaveError::Failed(message) => JsError::Error(message),
        }
    }
}

#[cfg(all(target_os = "ios", not(target_abi = "macabi")))]
mod platform {
    //! The Photos framework: `PHPhotoLibrary`'s add-only access, then a `performChanges` that
    //! creates an asset from the file. Both answer through completion handlers on Photos' own
    //! queues; this runs on a blocking thread and waits for them.

    use std::sync::mpsc;

    use block2::RcBlock;
    use objc2::{
        msg_send,
        rc::{Retained, autoreleasepool},
        runtime::{AnyClass, AnyObject, Bool},
    };
    use objc2_foundation::{NSBundle, NSError, NSString, NSURL};

    use super::SaveError;

    #[link(name = "Photos", kind = "framework")]
    unsafe extern "C" {}

    /// `PHAccessLevelAddOnly`.
    const ADD_ONLY: isize = 1;

    /// `PHAuthorizationStatus`.
    const NOT_DETERMINED: isize = 0;
    const AUTHORIZED: isize = 3;
    const LIMITED: isize = 4;

    pub(super) fn save(path: &str, video: bool) -> Result<(), SaveError> {
        autoreleasepool(|_| {
            let unavailable = || SaveError::Failed("Photos is not available".to_owned());
            // Asking without the description ends the app; this crate's `Cargo.toml` adds it, so
            // only a host built without it (an embedding app's) gets here.
            if !described() {
                return Err(SaveError::Failed(
                    "the app's Info.plist has no NSPhotoLibraryAddUsageDescription".to_owned(),
                ));
            }
            let library = AnyClass::get(c"PHPhotoLibrary").ok_or_else(unavailable)?;
            let requests = AnyClass::get(c"PHAssetChangeRequest").ok_or_else(unavailable)?;
            match access(library) {
                AUTHORIZED | LIMITED => {}
                _ => return Err(SaveError::Denied),
            }
            let url = NSURL::fileURLWithPath(&NSString::from_str(path));
            let changes = RcBlock::new(move || {
                // SAFETY: Photos' documented class methods, inside a `performChanges` block as
                // they must be, with a file URL. The request they return is Photos' to keep.
                unsafe {
                    let _: Option<Retained<AnyObject>> = if video {
                        msg_send![requests, creationRequestForAssetFromVideoAtFileURL: &*url]
                    } else {
                        msg_send![requests, creationRequestForAssetFromImageAtFileURL: &*url]
                    };
                }
            });
            let (done, finished) = mpsc::channel::<Result<(), String>>();
            let completion = RcBlock::new(move |ok: Bool, error: *mut NSError| {
                let result = if ok.as_bool() {
                    Ok(())
                } else if error.is_null() {
                    Err("Photos did not save it".to_owned())
                } else {
                    // SAFETY: a non-null error Photos hands the handler, alive during the call.
                    Err(unsafe { (*error).localizedDescription() }.to_string())
                };
                let _ = done.send(result);
            });
            // SAFETY: Photos' documented API; the handler runs once, on a queue of Photos'.
            unsafe {
                let shared: Retained<AnyObject> = msg_send![library, sharedPhotoLibrary];
                let _: () =
                    msg_send![&shared, performChanges: &*changes, completionHandler: &*completion];
            }
            match finished.recv() {
                Ok(result) => result.map_err(SaveError::Failed),
                Err(_) => Err(SaveError::Failed("Photos did not answer".to_owned())),
            }
        })
    }

    /// Whether the app's Info.plist describes adding to Photos, which iOS requires before asking.
    fn described() -> bool {
        NSBundle::mainBundle()
            .objectForInfoDictionaryKey(&NSString::from_str("NSPhotoLibraryAddUsageDescription"))
            .is_some()
    }

    /// The add-only access: asked of the user the first time, then what they chose.
    fn access(library: &AnyClass) -> isize {
        // SAFETY: Photos' documented class method, callable from any thread.
        let status: isize =
            unsafe { msg_send![library, authorizationStatusForAccessLevel: ADD_ONLY] };
        if status != NOT_DETERMINED {
            return status;
        }
        let (answer, answered) = mpsc::channel::<isize>();
        let handler = RcBlock::new(move |status: isize| {
            let _ = answer.send(status);
        });
        // SAFETY: Photos' documented class method; the handler runs once, on a queue of Photos'.
        unsafe {
            let _: () = msg_send![
                library,
                requestAuthorizationForAccessLevel: ADD_ONLY,
                handler: &*handler
            ];
        }
        answered.recv().unwrap_or(NOT_DETERMINED)
    }
}

#[cfg(not(all(target_os = "ios", not(target_abi = "macabi"))))]
mod platform {
    use super::SaveError;

    pub(super) fn save(_: &str, _: bool) -> Result<(), SaveError> {
        Err(SaveError::Failed("saving to Photos is only on iOS".to_owned()))
    }
}
