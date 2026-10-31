import json
import os
import sys
from gi.repository import Gio, GLib

# The packager supplies the registered desktop/session-bus identity.
APP_ID = sys.argv[1]
if not Gio.Application.id_is_valid(APP_ID):
    raise SystemExit('Invalid desktop application ID')

class ActivationReceiver(Gio.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.IS_SERVICE)
        self.token = None
        self.current_id = None
        self.input_buffer = b""

    def do_shutdown(self):
        if self.current_id is not None:
            try:
                self.remove_notification()
                self.get_dbus_connection().flush_sync(None)
            except GLib.Error:
                print('Could not withdraw desktop notification', file=sys.stderr)
        Gio.Application.do_shutdown(self)

    def do_startup(self):
        Gio.Application.do_startup(self)
        action = Gio.SimpleAction.new('open', GLib.VariantType.new('s'))
        action.connect('activate', self.open_notification)
        self.add_action(action)
        self.hold()
        GLib.io_add_watch(sys.stdin, GLib.IO_IN | GLib.IO_HUP, self.read_command)
        self.emit_message({'event': 'ready'})

    def emit_message(self, value):
        print(json.dumps(value), flush=True)

    def read_command(self, source, condition):
        if condition & GLib.IO_HUP:
            self.quit()
            return False
        data = os.read(source.fileno(), 32768)
        if not data:
            self.quit()
            return False
        self.input_buffer += data
        while b'\n' in self.input_buffer:
            line, self.input_buffer = self.input_buffer.split(b'\n', 1)
            if len(line) > 32768:
                self.quit()
                return False
            self.process_command(line)
        if len(self.input_buffer) > 32768:
            self.quit()
            return False
        return True

    def process_command(self, line):
        value = {}
        try:
            value = json.loads(line)
            if not isinstance(value, dict):
                value = {}
                raise ValueError('Invalid command')
            if value['event'] == 'show':
                ident = str(value['id'])
                # Portal acceptance is not proof of a visible banner.
                payload = {
                    'title': GLib.Variant('s', value['title'][:160]),
                    'body': GLib.Variant('s', value['body'][:1000]),
                    'icon': Gio.FileIcon.new(Gio.File.new_for_path(sys.argv[2])).serialize(),
                    'default-action': GLib.Variant('s', 'app.open'),
                    'default-action-target': GLib.Variant('s', ident),
                }
                self.get_dbus_connection().call_sync(
                    'org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop',
                    'org.freedesktop.portal.Notification', 'AddNotification',
                    GLib.Variant('(sa{sv})', ('rest-timer', payload)),
                    GLib.VariantType.new('()'), Gio.DBusCallFlags.NONE, 5000, None)
                self.current_id = ident
                self.emit_message({'event': 'accepted', 'id': ident})
            elif value['event'] == 'close' and str(value['id']) == self.current_id:
                self.remove_notification()
                self.current_id = None
        except (ValueError, KeyError, TypeError, GLib.Error) as error:
            self.emit_message({'event': 'error', 'id': str(value.get('id', '')), 'reason': type(error).__name__})

    def remove_notification(self):
        self.get_dbus_connection().call(
            'org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop',
            'org.freedesktop.portal.Notification', 'RemoveNotification',
            GLib.Variant('(s)', ('rest-timer',)), None,
            Gio.DBusCallFlags.NONE, 5000, None, None, None)

    def do_before_emit(self, platform_data):
        self.token = None
        for key in ('activation-token', 'desktop-startup-id'):
            value = platform_data.lookup_value(key, None)
            if value is not None and value.get_type_string() == 's':
                candidate = value.get_string()
                if 0 < len(candidate) <= 4096:
                    self.token = candidate
                    break
        Gio.Application.do_before_emit(self, platform_data)

    def open_notification(self, action, parameter):
        ident = parameter.get_string()
        if ident == self.current_id:
            self.emit_message({'event': 'activate', 'token': self.token, 'id': ident})
            self.remove_notification()
            self.current_id = None
        self.token = None

    def do_activate(self):
        # App activation from a launcher also carries platform data.
        self.emit_message({'event': 'activate', 'token': self.token})
        self.token = None

if __name__ == '__main__':
    raise SystemExit(ActivationReceiver().run([sys.argv[0]]))
