package SmartHome {

    // ─── Attribute Definitions ───
    attribute def Temperature;
    attribute def Percentage;
// ─── Traceability ───
    satisfy SH_STK_001 by MonitorHome;
    satisfy SH_STK_002 by SmartHomeSystem::lights;
    satisfy SH_STK_003 by SmartHomeSystem::cameras;

    satisfy SH_SYS_001 by SmartHomeSystem::thermostat;
    satisfy SH_SYS_002 by SmartHomeSystem::lights;
    satisfy SH_SYS_003 by SmartHomeSystem::cameras;

    verify SH_STK_001 by VerifyMonitoringCapability;
    verify SH_STK_002 by VerifyLightingControlCapability;
    verify SH_STK_003 by VerifyCameraCoverage;

    verify SH_SYS_001 by VerifyMonitoringCapability;
    verify SH_SYS_002 by VerifyLightingControlCapability;
    verify SH_SYS_003 by VerifyCameraCoverage;
// ─── Verification Cases ───
    action def VerifyMonitoringCapability {
        in item system : SmartHomeSystem;
    }

    action def VerifyLightingControlCapability {
        in item system : SmartHomeSystem;
    }

    action def VerifyCameraCoverage {
        in item system : SmartHomeSystem;
    }
// ─── Requirements ───
    requirement def SH_STK_001 {
        doc /* The smart home system shall monitor home conditions and coordinate connected devices so occupants can maintain comfort and awareness of home status. */;
        subject system : SmartHomeSystem;
    }

    requirement def SH_STK_002 {
        doc /* The smart home system shall support automated lighting control for one or more lights to improve occupant convenience. */;
        subject system : SmartHomeSystem;
    }

    requirement def SH_STK_003 {
        doc /* The smart home system shall support home security monitoring using between two and four security cameras. */;
        subject system : SmartHomeSystem;
    }

    requirement def SH_SYS_001 {
        doc /* The smart home system shall include one thermostat that provides target and current temperature data for home monitoring. */;
        subject system : SmartHomeSystem;
        derivedReq SH_STK_001;
    }

    requirement def SH_SYS_002 {
        doc /* The smart home system shall include at least one light controller with adjustable brightness and device state for automated lighting control. */;
        subject system : SmartHomeSystem;
        derivedReq SH_STK_002;
    }

    requirement def SH_SYS_003 {
        doc /* The smart home system shall include not fewer than two and not more than four security cameras for security monitoring. */;
        subject system : SmartHomeSystem;
        derivedReq SH_STK_003;
    }
    attribute def DeviceName;

    enum def DeviceState {
        off;
        on;
        standby;
    }

    // ─── Part Definitions ───
    part def Sensor {
        attribute name : DeviceName;
        attribute deviceState : DeviceState;
    }

    part def Thermostat :> Sensor {
        attribute targetTemp : Temperature;
        attribute currentTemp : Temperature;
    }

    part def LightController {
        attribute brightness : Percentage;
        attribute deviceState : DeviceState;
    }

    part def SecurityCamera :> Sensor {
        attribute resolution : DeviceName;
        attribute recording : DeviceState;
    }

    // ─── System Assembly ───
    part def SmartHomeSystem {
        part thermostat : Thermostat;
        part lights : LightController[1..*];
        part cameras : SecurityCamera[2..4];
    }

    // ─── Behavior ───
    action def MonitorHome {
        in item system : SmartHomeSystem;

        action checkTemperature;
        action adjustLights;
        action recordVideo;

        first checkTemperature;
        then adjustLights;
        then recordVideo;
    }
}