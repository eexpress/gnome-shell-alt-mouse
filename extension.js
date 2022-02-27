const { Clutter, Meta, Gdk, Shell, St } = imports.gi;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const AltTab = imports.ui.altTab;
const _backgroundMenu = imports.ui.backgroundMenu;
//~ part fork from: Just Perfection, panelScroll
const aggregateMenu = Main.panel.statusArea.aggregateMenu;

const debug = false;
//~ const debug = true;
function lg(s) {
	if (debug) log("===" + Me.uuid.split('@')[0] + "===>" + s)
};

const DisableBGMenu = true;
const maxflag = Meta.MaximizeFlags.VERTICAL;
let rightPanel = null;
const gap = 8;

//~ TODO:
//~ 判断鼠标下面有没有窗口。window_under_pointer
//~ ‌窗口去掉装饰条。不想使用外挂的xprop。
//~ ‌窗口上，全局附加alt键。
//~ panel.js中参见(#L595-L600)，maximized_vertically后(#L812)，panel变成dragWindow状态，导致panel正上方点击失效。
//~ 全屏后，panel消失，无法点击。需要全局控制权。
//~ 桌面双击才有效

class AltMouse {
	constructor() {
		this.previousDirection = Meta.MotionDirection.UP;
		this.listPointer = 0;
		this._originals = {};
		if (DisableBGMenu) this.backgroundMenuDisable();

		this.clickEventId = global.stage.connect('button-release-event', this.clickEvent.bind(this)); //~ 鼠标三个按钮需要在桌面双击才有效。
		this.scrollEventId = global.stage.connect('scroll-event', this.scrollEvent.bind(this));
	}

	skip_extensions() {
		let [x, y] = global.get_pointer();
		let pickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
		if (pickedActor.get_name() == 'panel') return false; // panel
		if (pickedActor.width == Main.layoutManager.primaryMonitor.width) return false; // desktop
		if (pickedActor.width == gap) return false; // gap
		return true;
	}

	clickEvent(actor, event) {
		if (this.skip_extensions()) return Clutter.EVENT_PROPAGATE;

		const altkey = event.get_state() & Clutter.ModifierType.MOD1_MASK;

		let w = global.display.get_focus_window();
		if (!w) return Clutter.EVENT_PROPAGATE;
		switch (event.get_button()) {
		case 1:
			if (altkey) { //全屏，全屏后无法再点击恢复。提前设置alt-f12恢复。
				//~ if (w.can_maximize())
				//~ if (w.is_fullscreen()) w.unmake_fullscreen();
				//~ else w.make_fullscreen();
				if (w.is_above())
					w.unmake_above();
				else
					w.make_above();
			} else { //移动
				if (w.allows_move()) w.begin_grab_op(Meta.GrabOp.MOVING, true, event.get_time());
			}
			return Clutter.EVENT_STOP;
		case 2: //中键
			if (altkey) { //关闭
				if (w.can_close()) w.kill();
			} else { //调大小
				if (w.allows_resize()) w.begin_grab_op(Meta.GrabOp.RESIZING_SE, true, event.get_time());
			}
			return Clutter.EVENT_STOP;
		case 3:
			if (altkey) { //最大化。最大化后，窗口正上方面板不能 1 键点击了。
				if (w.get_maximized() != maxflag)
					w.maximize(maxflag);
				else
					w.unmaximize(maxflag);
			} else { //置底。追加上滚聚焦，滚轮下滚可立刻恢复。
				w.lower();
				this.switchWindows(Meta.MotionDirection.UP);
			}
			return Clutter.EVENT_STOP;
		default:
			return Clutter.EVENT_PROPAGATE;
		}
	}

	// direction +1 / -1, 0 toggles mute
	adjustVolume(direction) { // GdH method
		const Volume = imports.ui.status.volume;
		let mixerControl = Volume.getMixerControl();
		let sink = mixerControl.get_default_sink();

		if (direction === 0) {
			sink.change_is_muted(!sink.is_muted);
		} else {
			let volume = sink.volume;
			let max = mixerControl.get_vol_max_norm();
			let step = direction * 2048;

			volume = volume + step;
			if (volume > max) volume = max;
			if (volume < 0) volume = 0;
			sink.volume = volume;
			sink.push_volume();
		}
	}

	scrollEvent(actor, event) {
		//~ const GdH = true;
		const GdH = false;
		if (this.skip_extensions()) return Clutter.EVENT_PROPAGATE;

		const altkey = event.get_state() & Clutter.ModifierType.MOD1_MASK;
		if (altkey && !GdH) { // Just.P method
			aggregateMenu._volume._handleScrollEvent(0, event);
			return Clutter.EVENT_STOP;
		}
		let adj; // GdH method
		let direction;
		switch (event.get_scroll_direction()) {
		case Clutter.ScrollDirection.UP:
		case Clutter.ScrollDirection.LEFT:
			direction = Meta.MotionDirection.UP;
			adj = 1; // GdH method
			break;
		case Clutter.ScrollDirection.DOWN:
		case Clutter.ScrollDirection.RIGHT:
			direction = Meta.MotionDirection.DOWN;
			adj = -1; // GdH method
			break;
		default:
			return Clutter.EVENT_PROPAGATE;
		}
		if (altkey && GdH)
			this.adjustVolume(adj);
		else // GdH method
			this.switchWindows(direction); //切换
		return Clutter.EVENT_STOP;
	}

	showinfo(w) {
		lg(w.get_title());
	};

	switchWindows(direction) {
		let windows = this.getWindows();
		//~ windows.forEach(w => this.showinfo(w));
		//~ windows.forEach((w) => {w.decorated = false;});	//Property MetaWindowX11.decorated is not writable 但是 Gtk 的进程里面可以。
		//~ 其他扩展，外挂使用 `xprop` 去边框
		if (windows.length <= 1) return;

		if (direction != this.previousDirection) {
			this.listPointer = 1;
		} else {
			this.listPointer += 1;
			if (this.listPointer > windows.length - 1)
				this.listPointer = windows.length - 1;
		}
		this.previousDirection = direction;
		windows[this.listPointer].activate(global.get_current_time());
	}

	getWindows() {
		return AltTab.getWindows(global.workspace_manager.get_active_workspace());
	}

	backgroundMenuEnable() {
		//~ _backgroundMenu.reactive = true;
		if (this._originals['bgMenu']) _backgroundMenu.BackgroundMenu.prototype.open = this._originals['bgMenu'];
	}

	backgroundMenuDisable() {
		//~ _backgroundMenu.reactive = false;
		if (!this._originals['bgMenu']) this._originals['bgMenu'] = _backgroundMenu.BackgroundMenu.prototype.open;

		_backgroundMenu.BackgroundMenu.prototype.open = () => {};
	}

	destroy() {
		if (this.scrollEventId != null) {
			global.stage.disconnect(this.scrollEventId);
			this.scrollEventId = null;
		}
		if (this.clickEventId != null) {
			global.stage.disconnect(this.clickEventId);
			this.clickEventId = null;
		}
		if (DisableBGMenu) this.backgroundMenuEnable();
	}
}

let altmouse;

function init(metadata) {
}

function enable() {
	lg("start");
	//~ This part copy from `Edge Gap`, Its idea is in line with me.
	const monitor = Main.layoutManager.primaryMonitor;
	rightPanel = new St.Bin({
		reactive : false,
		can_focus : false,
		track_hover : false,
		height : monitor.height,
		width : gap,
	});
	rightPanel.set_position(monitor.width - gap, 0);
	Main.layoutManager.addChrome(rightPanel, {
		affectsInputRegion : true,
		affectsStruts : true,
	});
	altmouse = new AltMouse();
}

function disable() {
	lg("stop");
	Main.layoutManager.removeChrome(rightPanel);
	rightPanel.destroy();
	rightPanel = null;
	altmouse.destroy();
	altmouse = null;
}
