package rocket {
    requirement def Thrusters {
        doc /* The rocket shall have 2 thrusters. */
          
}
        part def Rocket {
        doc /* A vehicle designed to propel itself by expelling exhaust gas. */

        part thrusters : Thrusters[3];
        part fuel : Fuel;

        attribute maxSpeed : Real;
        attribute range : Real;
    }
}