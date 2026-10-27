import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';

import GerenciadorMedicamentos from './src/screens/GerenciadorMedicamentos';
import Historico from './src/screens/Historico';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName = route.name === 'Hoje' ? 'calendar' : 'clock';
            return <Feather name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#0EA5E9',
          tabBarInactiveTintColor: '#94A3B8',
          headerShown: false,
        })}
      >
        <Tab.Screen name="Hoje" component={GerenciadorMedicamentos} />
        <Tab.Screen name="Histórico" component={Historico} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
