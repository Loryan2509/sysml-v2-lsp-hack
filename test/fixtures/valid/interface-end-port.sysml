// Issue #15: "end port" in interface def should not produce errors.
// The 'port' keyword is optional for end features in interface definitions.

port def PowerPort;
port def SignalPort;

interface def MyIntf1 {
    /* One usage is declared with the port keyword, which is optional.
       The other is using shorthand, skipping the "port" keyword. */
    end port port1 : PowerPort;
    end port2 : SignalPort;
}
