package tw.student.focusclock;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FocusDisplayPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
