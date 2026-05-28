package im.autosafe.temperatura;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AutosafeBlePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
