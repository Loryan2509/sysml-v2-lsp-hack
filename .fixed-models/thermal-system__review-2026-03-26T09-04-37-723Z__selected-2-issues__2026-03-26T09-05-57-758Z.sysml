package thermal_system {
    requirement def CoolingFanActivation {
        doc /* The cooling fan shall turn on when temperature reaches 80 degrees Celsius. */
    }

    requirement def EmergencyShutdown {
        doc /* The system shall enter emergency shutdown when temperature reaches 90 degrees Celsius. */
    }

    part def CoolingSystem {
        attribute temperatureC : Real = 25.0;
        attribute coolingFanStartThresholdC : Real = 80.0;
        attribute emergencyShutdownThresholdC : Real = 90.0;
    }

    part def System {
        part cooling : CoolingSystem;
    }
}