type MenuOptions = { text?: string; action?: () => void | Promise<void>; items?: any[]; item?: string }

class BaseItem {
  options: MenuOptions
  constructor(options: MenuOptions = {}) { this.options = options }
  static async new(options: MenuOptions = {}) { return new (this as any)(options) }
}

export class MenuItem extends BaseItem {}
export class Submenu extends BaseItem {}
export class PredefinedMenuItem extends BaseItem {}

export class Menu extends BaseItem {
  async popup(): Promise<void> {
    // Native context menus are intentionally omitted in the browser preview.
  }
}
