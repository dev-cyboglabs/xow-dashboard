import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function LoginScreen() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deviceName, setDeviceName] = useState('');

  useEffect(() => {
    checkExistingLogin();
  }, []);

  const checkExistingLogin = async () => {
    try {
      const savedDevice = await AsyncStorage.getItem('xow_device');
      if (savedDevice) {
        router.replace('/recorder');
      }
    } catch (error) {
      console.log('No existing login');
    }
  };

  const handleLogin = async () => {
    if (!deviceId.trim() || !password.trim()) {
      Alert.alert('Error', 'Enter Device ID and Password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        device_id: deviceId.trim(),
        password: password.trim(),
      });

      if (response.data.success) {
        await AsyncStorage.setItem('xow_device', JSON.stringify(response.data.device));
        router.replace('/recorder');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!deviceId.trim() || !password.trim() || !deviceName.trim()) {
      Alert.alert('Error', 'Fill all fields');
      return;
    }

    setIsLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/register`, {
        device_id: deviceId.trim(),
        password: password.trim(),
        name: deviceName.trim(),
      });
      Alert.alert('Success', 'Device registered!');
      setIsRegistering(false);
      setDeviceName('');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Left - Branding */}
      <View style={styles.leftPanel}>
        <View style={styles.logo}>
          <Ionicons name="videocam" size={36} color="#fff" />
        </View>
        <Text style={styles.brand}>XoW</Text>
        <Text style={styles.tagline}>Booth Recording System</Text>
        
        <View style={styles.features}>
          <View style={styles.feature}>
            <Ionicons name="recording" size={16} color="#8B5CF6" />
            <Text style={styles.featureText}>HD Recording</Text>
          </View>
          <View style={styles.feature}>
            <Ionicons name="scan" size={16} color="#8B5CF6" />
            <Text style={styles.featureText}>Visitor Tracking</Text>
          </View>
          <View style={styles.feature}>
            <Ionicons name="cloud" size={16} color="#8B5CF6" />
            <Text style={styles.featureText}>Cloud Sync</Text>
          </View>
        </View>
      </View>

      {/* Right - Form */}
      <View style={styles.rightPanel}>
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{isRegistering ? 'Register' : 'Login'}</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>DEVICE ID</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter ID"
              placeholderTextColor="#444"
              value={deviceId}
              onChangeText={setDeviceId}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, {flex: 1}]}
                placeholder="Enter password"
                placeholderTextColor="#444"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={18} color="#666" />
              </TouchableOpacity>
            </View>
          </View>

          {isRegistering && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>BOOTH NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Tech Booth A1"
                placeholderTextColor="#444"
                value={deviceName}
                onChangeText={setDeviceName}
              />
            </View>
          )}

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={isRegistering ? handleRegister : handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitText}>{isRegistering ? 'Register' : 'Connect'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsRegistering(!isRegistering)}>
            <Text style={styles.switchText}>
              {isRegistering ? 'Back to Login' : 'Register New Device'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000',
  },
  leftPanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1a1a1a',
    padding: 24,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  brand: {
    fontSize: 42,
    fontWeight: '800',
    color: '#fff',
  },
  tagline: {
    fontSize: 12,
    color: '#666',
    marginBottom: 24,
  },
  features: {
    gap: 10,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    color: '#888',
    fontSize: 12,
  },
  rightPanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  formCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#0A0A0A',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#222',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeBtn: {
    padding: 10,
  },
  submitBtn: {
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  switchText: {
    color: '#8B5CF6',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
});
